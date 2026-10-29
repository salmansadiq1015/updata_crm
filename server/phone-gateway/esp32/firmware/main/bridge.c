// Updata ESP32 HFP bridge: Bluetooth Hands-Free (HF role) <-> USB serial (protocol v1).
//
// Tasks and contexts
//   BT callbacks (Bluedroid tasks): update state, move SCO audio in/out of the rings. Never touch the UART.
//   rx task: reads the UART, decodes frames, runs commands, queues ACKs, feeds AI audio into s_down.
//   tx task: the ONLY UART writer. Sends queued control frames, 20 ms AUDIO_UP frames from s_up,
//            STATE on change, STATS every second; enforces the host-loss and discoverable timeouts.
//
// Audio: CVSD over HCI (wideband disabled in sdkconfig.defaults) gives 8 kHz s16le PCM. Each SCO
// decoded PCM callback wakes the internal codec's outgoing callback, which reads s_down
// (silence when empty), so the phone's clock paces everything.

#include "bridge.h"
#include "hostwatchdog.h"

#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/uart.h"
#include "esp_app_desc.h"
#include "esp_bt.h"
#include "esp_bt_device.h"
#include "esp_bt_main.h"
#include "esp_chip_info.h"
#include "esp_gap_bt_api.h"
#include "esp_hf_client_api.h"
#include "esp_idf_version.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "nvs.h"
#include "soc/uart_pins.h"

#include "devstate.h"
#include "dialauth.h"
#include "proto.h"
#include "ring.h"

#define TAG "updata"
#define UART_PORT UART_NUM_0
#define BOOT_BUTTON GPIO_NUM_0
#define UP_FRAME_BYTES 320  // 20 ms of 8 kHz s16 mono
#define CALL_ENDED_SHOW_MS 3000
#define NVS_NS "updata"

#define CAP_HFP_HF (1 << 0)
#define CAP_VOICE_OVER_HCI (1 << 1)
#define CAP_CVSD (1 << 2)
#define CAP_MSBC (1 << 3)
#define CAP_DIAL_AUTH (1 << 4)
#define CAP_PRESENCE_BUTTON (1 << 5)

typedef struct {
    uint8_t type;
    uint16_t len;
    uint8_t payload[96];
} txmsg_t;

static uint8_t s_up_store[4096];  // ~256 ms phone -> host
static uint8_t s_down_store[4800];  // ~300 ms host -> phone
static ring_t s_up, s_down;
static QueueHandle_t s_txq;
static TaskHandle_t s_tx_task;
static dialpolicy_t s_policy;

static struct {
    volatile bool session_open, bt_ready, fault, recently_ended_flag;
    volatile uint8_t hfp, call, callsetup, audio, codec, signal, battery;
    esp_bd_addr_t peer;
    volatile bool have_peer;
    volatile uint32_t call_ref, ag_features;
    volatile int64_t ended_at_us, discoverable_until_us;
    uint8_t nonce[DIALAUTH_NONCE_LEN];
    uint8_t key[DIALAUTH_KEY_LEN];
    volatile bool key_ok;
    volatile uint32_t last_host_rx_ms;
    volatile bool host_lost_pending, dial_pending, down_started;
    volatile uint32_t up_index;
    volatile uint32_t state_version;
    uint8_t reset_reason;
} S;

static struct {
    volatile uint32_t audio_up_frames, audio_down_frames, down_underruns, down_overruns, up_drops, rx_crc_errors,
        rx_resyncs, down_seq_gaps, tx_queue_drops, bad_sco_frames;
} C;

static inline uint32_t now_ms(void) { return (uint32_t)(esp_timer_get_time() / 1000); }
static inline void state_changed(void) { S.state_version++; }

// ---- outgoing frames ---------------------------------------------------------------------------

static void tx_post(uint8_t type, const void *payload, uint16_t len)
{
    txmsg_t m = {.type = type, .len = len > sizeof(m.payload) ? sizeof(m.payload) : len};
    if (m.len) {
        memcpy(m.payload, payload, m.len);
    }
    if (xQueueSend(s_txq, &m, 0) != pdTRUE) {
        C.tx_queue_drops++;
    }
    xTaskNotifyGive(s_tx_task);
}

static void post_ack(uint16_t seq, uint8_t type, uint8_t result)
{
    uint8_t p[4];
    proto_wr16(p, seq);
    p[2] = type;
    p[3] = result;
    tx_post(T_ACK, p, sizeof(p));
}

static void post_event(uint8_t code, const void *data, uint16_t len)
{
    uint8_t p[64];
    if (len > sizeof(p) - 1) {
        len = sizeof(p) - 1;
    }
    p[0] = code;
    if (len) {
        memcpy(p + 1, data, len);
    }
    tx_post(T_EVENT, p, (uint16_t)(len + 1));
}

static uint16_t s_tx_seq;
static uint8_t s_tx_buf[PROTO_MAX_FRAME];

static void tx_frame(uint8_t type, const uint8_t *payload, uint16_t len)  // tx task only
{
    size_t n = proto_encode(s_tx_buf, sizeof(s_tx_buf), type, s_tx_seq++, payload, len);
    if (n) {
        uart_write_bytes(UART_PORT, s_tx_buf, n);
    }
}

static uint8_t current_state(void)
{
    devstate_in_t in = {
        .fault = S.fault,
        .session_open = S.session_open,
        .bt_ready = S.bt_ready,
        .hfp = S.hfp,
        .call = S.call,
        .callsetup = S.callsetup,
        .audio = S.audio,
        .recently_ended = S.ended_at_us && (esp_timer_get_time() - S.ended_at_us) < CALL_ENDED_SHOW_MS * 1000LL,
    };
    return devstate_derive(&in);
}

static void send_state(void)
{
    uint8_t p[22];
    p[0] = current_state();
    p[1] = S.hfp;
    p[2] = S.call;
    p[3] = S.callsetup;
    p[4] = S.audio;
    p[5] = S.codec;
    p[6] = S.signal;
    p[7] = S.battery;
    memcpy(p + 8, S.peer, 6);
    proto_wr32(p + 14, S.call_ref);
    proto_wr32(p + 18, S.ag_features);
    tx_frame(T_STATE, p, sizeof(p));
}

static void send_stats(void)
{
    uint8_t p[46];
    uint32_t v[11] = {now_ms(), esp_get_free_heap_size(), esp_get_minimum_free_heap_size(), C.audio_up_frames,
                      C.audio_down_frames, C.down_underruns, C.down_overruns, C.up_drops, C.rx_crc_errors,
                      C.rx_resyncs, C.down_seq_gaps};
    for (int i = 0; i < 11; i++) {
        proto_wr32(p + 4 * i, v[i]);
    }
    proto_wr16(p + 44, (uint16_t)ring_used(&s_down));
    tx_frame(T_STATS, p, sizeof(p));
}

static void send_hello_ack(void)
{
    uint8_t p[96];
    esp_chip_info_t chip;
    esp_chip_info(&chip);
    const uint8_t *addr = esp_bt_dev_get_address();
    p[0] = PROTO_MAJOR;
    p[1] = PROTO_MINOR;
    p[2] = (uint8_t)chip.revision;
    p[3] = CAP_HFP_HF | CAP_VOICE_OVER_HCI | CAP_CVSD | CAP_DIAL_AUTH | CAP_PRESENCE_BUTTON;
    if (addr) {
        memcpy(p + 4, addr, 6);
    } else {
        memset(p + 4, 0, 6);
    }
    memcpy(p + 10, S.nonce, DIALAUTH_NONCE_LEN);
    proto_wr16(p + 26, PROTO_MAX_PAYLOAD);
    p[28] = 1;  // codec bits: CVSD
    p[29] = S.key_ok ? 1 : 0;
    size_t off = 30;
    const char *strs[2] = {esp_app_get_description()->version, esp_get_idf_version()};
    for (int i = 0; i < 2; i++) {
        size_t n = strnlen(strs[i], 31);
        p[off++] = (uint8_t)n;
        memcpy(p + off, strs[i], n);
        off += n;
    }
    tx_frame(T_HELLO_ACK, p, (uint16_t)off);
}

// ---- tx task -----------------------------------------------------------------------------------

static void tx_task(void *arg)
{
    (void)arg;
    esp_task_wdt_add(NULL);
    uint32_t last_stats = 0, sent_version = 0;
    uint8_t audio[7 + UP_FRAME_BYTES];
    // At the project's 100 Hz tick rate, pdMS_TO_TICKS(5) is zero. A zero
    // timeout spins on core 1 and starves its watched idle task, resetting the
    // board every five seconds. Always block for at least one tick when idle.
    const TickType_t wait_ticks = pdMS_TO_TICKS(5) > 0 ? pdMS_TO_TICKS(5) : 1;
    for (;;) {
        esp_task_wdt_reset();
        txmsg_t m;
        while (xQueueReceive(s_txq, &m, 0) == pdTRUE) {
            if (m.type == T_HELLO_ACK) {
                send_hello_ack();
                send_state();
                sent_version = S.state_version;
            } else {
                tx_frame(m.type, m.payload, m.len);
            }
        }
        while (ring_used(&s_up) >= UP_FRAME_BYTES) {
            proto_wr32(audio, S.up_index);
            proto_wr16(audio + 4, (uint16_t)ring_used(&s_down));
            audio[6] = S.codec;
            ring_read(&s_up, audio + 7, UP_FRAME_BYTES);
            S.up_index += UP_FRAME_BYTES / 2;
            if (S.session_open) {
                tx_frame(T_AUDIO_UP, audio, sizeof(audio));
                C.audio_up_frames++;
            }
        }
        uint32_t now = now_ms();
        if (S.state_version != sent_version) {
            sent_version = S.state_version;
            send_state();
        }
        if (S.session_open && now - last_stats >= 1000) {
            last_stats = now;
            send_stats();
        }
        // Host gone during a call: the lead would hear dead air. End the call, tell the next session.
        if (S.session_open && (S.call || S.callsetup) && hostwatchdog_expired(now, S.last_host_rx_ms, CONFIG_UPDATA_HOST_TIMEOUT_MS)) {
            S.session_open = false;
            S.host_lost_pending = true;
            esp_hf_client_reject_call();  // AT+CHUP: ends a dialing, ringing or active call
            state_changed();
        }
        if (S.discoverable_until_us && esp_timer_get_time() > S.discoverable_until_us) {
            S.discoverable_until_us = 0;
            esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_NON_DISCOVERABLE);
        }
        if (S.ended_at_us && esp_timer_get_time() - S.ended_at_us > CALL_ENDED_SHOW_MS * 1000LL) {
            S.ended_at_us = 0;
            state_changed();
        }
        ulTaskNotifyTake(pdTRUE, wait_ticks);
    }
}

// ---- commands ----------------------------------------------------------------------------------

static bool resolve_peer(const uint8_t *requested, esp_bd_addr_t out)
{
    static const uint8_t zero[6] = {0};
    if (memcmp(requested, zero, 6) != 0) {
        memcpy(out, requested, 6);
        return true;
    }
    if (S.have_peer) {
        memcpy(out, S.peer, 6);
        return true;
    }
    int n = esp_bt_gap_get_bond_device_num();
    if (n <= 0) {
        return false;
    }
    esp_bd_addr_t list[4];
    int got = n > 4 ? 4 : n;
    if (esp_bt_gap_get_bond_device_list(&got, list) != ESP_OK || got < 1) {
        return false;
    }
    memcpy(out, list[0], 6);
    return true;
}

static void save_blob(const char *name, const void *data, size_t len)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READWRITE, &h) == ESP_OK) {
        nvs_set_blob(h, name, data, len);
        nvs_commit(h);
        nvs_close(h);
    }
}

static uint8_t cmd_dial(const proto_frame_t *f)
{
    if (f->len < 9) {
        return R_BAD_ARG;
    }
    uint32_t call_ref = proto_rd32(f->payload);
    uint32_t counter = proto_rd32(f->payload + 4);
    uint8_t nlen = f->payload[8];
    if (nlen > DIALAUTH_MAX_NUMBER || f->len != 9 + nlen + DIALAUTH_MAC_LEN || call_ref == 0) {
        return R_BAD_ARG;
    }
    const char *number = (const char *)f->payload + 9;
    const uint8_t *mac = f->payload + 9 + nlen;
    if (!dialauth_number_ok(number, nlen)) {
        return R_BAD_ARG;
    }
    dialpolicy_ctx_t ctx = {
        .session_open = S.session_open,
        .key_provisioned = S.key_ok,
        .hfp_ready = S.hfp == HFP_SLC,
        .call_idle = S.call == 0 && S.callsetup == 0 && !S.dial_pending,
    };
    uint32_t now = now_ms();
    int rc = dialpolicy_check(&s_policy, &ctx, counter, now);
    if (rc != R_OK) {
        return (uint8_t)rc;
    }
    if (!dialauth_verify(S.key, S.nonce, counter, call_ref, number, nlen, mac)) {
        return R_UNAUTHORIZED;
    }
    char num[DIALAUTH_MAX_NUMBER + 1];
    memcpy(num, number, nlen);
    num[nlen] = 0;
    S.call_ref = call_ref;
    S.dial_pending = true;
    if (esp_hf_client_dial(num) != ESP_OK) {
        S.dial_pending = false;
        return R_STACK_ERROR;
    }
    dialpolicy_commit(&s_policy, counter, now);
    state_changed();
    return R_OK;
}

static void handle_frame(const proto_frame_t *f)
{
    static uint16_t last_down_seq;
    static bool have_down_seq;
    S.last_host_rx_ms = now_ms();

    if (f->type == T_AUDIO_DOWN) {  // hot path, no ACK
        if (have_down_seq && (uint16_t)(f->seq - last_down_seq) != 1) {
            C.down_seq_gaps++;
        }
        last_down_seq = f->seq;
        have_down_seq = true;
        if (!S.session_open || S.audio != AUDIO_ON || f->len < 4) {
            return;
        }
        if (ring_write(&s_down, f->payload + 4, f->len - 4)) {
            S.down_started = true;
            C.audio_down_frames++;
        } else {
            C.down_overruns++;  // host sent ahead of the phone's clock; bounded, counted, dropped
        }
        return;
    }
    if (f->type == T_PING) {
        tx_post(T_PONG, f->payload, f->len >= 4 ? 4 : f->len);
        return;
    }
    if (f->type == T_HELLO) {
        if (f->len < 2 || f->payload[0] != PROTO_MAJOR) {
            post_ack(f->seq, f->type, R_BAD_ARG);
            return;
        }
        esp_fill_random(S.nonce, sizeof(S.nonce));
        dialpolicy_new_session(&s_policy);
        have_down_seq = false;
        S.session_open = true;
        tx_post(T_HELLO_ACK, NULL, 0);  // built by the tx task (it also sends STATE)
        if (S.host_lost_pending) {
            S.host_lost_pending = false;
            post_event(EV_HOST_LOST_HANGUP, NULL, 0);
        }
        return;
    }
    if (!S.session_open) {
        post_ack(f->seq, f->type, R_NO_SESSION);
        return;
    }

    uint8_t rc = R_OK;
    esp_bd_addr_t bda;
    switch (f->type) {
    case T_STATUS_REQ:
        state_changed();
        break;
    case T_HFP_CONNECT:
        if (f->len != 6) {
            rc = R_BAD_ARG;
        } else if (S.hfp != HFP_DISCONNECTED) {
            rc = R_BAD_STATE;
        } else if (!resolve_peer(f->payload, bda)) {
            rc = R_BAD_STATE;  // nothing bonded yet: pair first
        } else if (esp_hf_client_connect(bda) != ESP_OK) {
            rc = R_STACK_ERROR;
        }
        break;
    case T_HFP_DISCONNECT:
        if (S.call || S.callsetup) {
            rc = R_BUSY;  // hang up first; never orphan a live call
        } else if (S.hfp == HFP_DISCONNECTED || esp_hf_client_disconnect(S.peer) != ESP_OK) {
            rc = R_BAD_STATE;
        }
        break;
    case T_SET_DISCOVERABLE:
        if (f->len != 2) {
            rc = R_BAD_ARG;
        } else {
            uint16_t secs = proto_rd16(f->payload);
            secs = secs > 600 ? 600 : secs;
            S.discoverable_until_us = secs ? esp_timer_get_time() + secs * 1000000LL : 0;
            esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, secs ? ESP_BT_GENERAL_DISCOVERABLE : ESP_BT_NON_DISCOVERABLE);
        }
        break;
    case T_DIAL:
        rc = cmd_dial(f);
        break;
    case T_HANGUP:  // always allowed: ending a call is the safe direction
        if (!(S.call || S.callsetup || S.dial_pending)) {
            rc = R_BAD_STATE;
        } else if (esp_hf_client_reject_call() != ESP_OK) {
            rc = R_STACK_ERROR;
        }
        break;
    case T_AUDIO_CONNECT:
        if (S.hfp != HFP_SLC || !S.call) {
            rc = R_BAD_STATE;
        } else if (S.audio == AUDIO_OFF && esp_hf_client_connect_audio(S.peer) != ESP_OK) {
            rc = R_STACK_ERROR;
        }
        break;
    case T_AUDIO_DISCONNECT:
        if (S.audio == AUDIO_OFF || esp_hf_client_disconnect_audio(S.peer) != ESP_OK) {
            rc = R_BAD_STATE;
        }
        break;
    case T_DTMF: {
        char d = f->len == 5 ? (char)f->payload[4] : 0;
        bool valid = (d >= '0' && d <= '9') || d == '*' || d == '#' || (d >= 'A' && d <= 'D');
        if (!valid) {
            rc = R_BAD_ARG;
        } else if (!S.call || proto_rd32(f->payload) != S.call_ref) {
            rc = R_BAD_STATE;
        } else if (esp_hf_client_send_dtmf(d) != ESP_OK) {
            rc = R_STACK_ERROR;
        }
        break;
    }
    case T_VOLUME:
        if (f->len != 2 || f->payload[0] > 15 || f->payload[1] > 15) {
            rc = R_BAD_ARG;
        } else if (S.hfp != HFP_SLC) {
            rc = R_BAD_STATE;
        } else {
            esp_hf_client_volume_update(ESP_HF_VOLUME_CONTROL_TARGET_SPK, f->payload[0]);
            esp_hf_client_volume_update(ESP_HF_VOLUME_CONTROL_TARGET_MIC, f->payload[1]);
        }
        break;
    case T_PROVISION_KEY:
        if (f->len != DIALAUTH_KEY_LEN) {
            rc = R_BAD_ARG;
        } else if (gpio_get_level(BOOT_BUTTON) != 0) {
            rc = R_NO_PRESENCE;  // hold the board's BOOT button while provisioning
        } else {
            memcpy(S.key, f->payload, DIALAUTH_KEY_LEN);
            save_blob("dialkey", S.key, DIALAUTH_KEY_LEN);
            S.key_ok = true;
        }
        break;
    default:
        rc = R_UNKNOWN_TYPE;
    }
    post_ack(f->seq, f->type, rc);
}

static void rx_task(void *arg)
{
    (void)arg;
    esp_task_wdt_add(NULL);
    static proto_decoder_t dec;
    static proto_frame_t frame;
    static uint8_t buf[512];
    proto_decoder_init(&dec);
    for (;;) {
        esp_task_wdt_reset();
        int n = uart_read_bytes(UART_PORT, buf, sizeof(buf), pdMS_TO_TICKS(20));
        for (int i = 0; i < n; i++) {
            if (proto_decoder_push(&dec, buf[i], &frame)) {
                handle_frame(&frame);
            }
        }
        C.rx_crc_errors = dec.crc_errors;
        C.rx_resyncs = dec.resyncs;
    }
}

// ---- Bluetooth callbacks -----------------------------------------------------------------------

#if CONFIG_BT_HFP_USE_EXTERNAL_CODEC
#error "The USB protocol carries decoded PCM; this bridge requires the internal HFP codec"
#endif

static void audio_incoming_cb(const uint8_t *data, uint32_t n)
{
    if (!ring_write(&s_up, data, n)) {
        C.up_drops++;
    }
    // The SDK's decoded-PCM API is distinct from its external-codec SCO API.
    esp_hf_client_outgoing_data_ready();
    xTaskNotifyGive(s_tx_task);
}

static uint32_t audio_outgoing_cb(uint8_t *data, uint32_t n)
{
    size_t got = ring_read(&s_down, data, n);
    if (got < n) {
        memset(data + got, 0, n - got);
        if (S.down_started) {
            C.down_underruns++;
        }
    }
    return n;
}

static void hf_cb(esp_hf_client_cb_event_t event, esp_hf_client_cb_param_t *p)
{
    switch (event) {
    case ESP_HF_CLIENT_CONNECTION_STATE_EVT:
        switch (p->conn_stat.state) {
        case ESP_HF_CLIENT_CONNECTION_STATE_CONNECTING:
            S.hfp = HFP_CONNECTING;
            break;
        case ESP_HF_CLIENT_CONNECTION_STATE_CONNECTED:
            S.hfp = HFP_CONNECTED;
            break;
        case ESP_HF_CLIENT_CONNECTION_STATE_SLC_CONNECTED:
            S.hfp = HFP_SLC;
            S.ag_features = p->conn_stat.peer_feat;
            if (!S.have_peer || memcmp(S.peer, p->conn_stat.remote_bda, 6) != 0) {
                memcpy(S.peer, p->conn_stat.remote_bda, 6);
                S.have_peer = true;
                save_blob("peer", S.peer, 6);
            }
            break;
        default:  // disconnected / disconnecting: nothing about a call can be trusted any more
            S.hfp = HFP_DISCONNECTED;
            S.call = 0;
            S.callsetup = 0;
            S.audio = AUDIO_OFF;
            S.dial_pending = false;
        }
        break;
    case ESP_HF_CLIENT_AUDIO_STATE_EVT:
        if (p->audio_stat.state == ESP_HF_CLIENT_AUDIO_STATE_CONNECTED ||
            p->audio_stat.state == ESP_HF_CLIENT_AUDIO_STATE_CONNECTED_MSBC) {
            ring_clear(&s_down);
            S.up_index = 0;
            S.down_started = false;
            S.codec = p->audio_stat.state == ESP_HF_CLIENT_AUDIO_STATE_CONNECTED_MSBC ? 2 : 1;
            ESP_ERROR_CHECK(esp_hf_client_register_data_callback(audio_incoming_cb, audio_outgoing_cb));
            S.audio = AUDIO_ON;
        } else if (p->audio_stat.state == ESP_HF_CLIENT_AUDIO_STATE_CONNECTING) {
            S.audio = AUDIO_CONNECTING;
        } else {
            S.audio = AUDIO_OFF;
            S.codec = 0;
        }
        break;
    case ESP_HF_CLIENT_CIND_CALL_EVT:
        if (S.call && p->call.status == ESP_HF_CALL_STATUS_NO_CALLS) {
            S.ended_at_us = esp_timer_get_time();
        }
        S.call = p->call.status == ESP_HF_CALL_STATUS_CALL_IN_PROGRESS ? 1 : 0;
        break;
    case ESP_HF_CLIENT_CIND_CALL_SETUP_EVT:
        if (S.callsetup && p->call_setup.status == ESP_HF_CALL_SETUP_STATUS_IDLE && !S.call) {
            S.ended_at_us = esp_timer_get_time();  // ended before it was answered
        }
        S.callsetup = (uint8_t)p->call_setup.status;
        break;
    case ESP_HF_CLIENT_CIND_SIGNAL_STRENGTH_EVT:
        S.signal = (uint8_t)p->signal_strength.value;
        break;
    case ESP_HF_CLIENT_CIND_BATTERY_LEVEL_EVT:
        S.battery = (uint8_t)p->battery_level.value;
        break;
    case ESP_HF_CLIENT_RING_IND_EVT:
        post_event(EV_RING, NULL, 0);
        break;
    case ESP_HF_CLIENT_CLIP_EVT:
        if (p->clip.number) {
            post_event(EV_CLIP, p->clip.number, (uint16_t)strnlen(p->clip.number, 40));
        }
        break;
    case ESP_HF_CLIENT_VOLUME_CONTROL_EVT: {
        uint8_t v[2] = {(uint8_t)p->volume_control.type, (uint8_t)p->volume_control.volume};
        post_event(EV_VOLUME, v, 2);
        break;
    }
    case ESP_HF_CLIENT_AT_RESPONSE_EVT:
        if (S.dial_pending) {
            uint8_t d[5];
            proto_wr32(d, S.call_ref);
            // 0 = OK; CME errors as their code; other result codes as 0x80 | code
            d[4] = p->at_response.code == ESP_HF_AT_RESPONSE_CODE_OK    ? 0
                   : p->at_response.code == ESP_HF_AT_RESPONSE_CODE_CME ? (uint8_t)p->at_response.cme
                                                                         : (uint8_t)(0x80 | p->at_response.code);
            S.dial_pending = false;
            post_event(EV_DIAL_RESULT, d, sizeof(d));
        }
        break;
    default:
        break;
    }
    state_changed();
}

static void gap_cb(esp_bt_gap_cb_event_t event, esp_bt_gap_cb_param_t *p)
{
    bool window_open = S.discoverable_until_us != 0;
    switch (event) {
    case ESP_BT_GAP_AUTH_CMPL_EVT: {
        uint8_t d[7];
        d[0] = p->auth_cmpl.stat == ESP_BT_STATUS_SUCCESS ? 0 : (uint8_t)p->auth_cmpl.stat;
        memcpy(d + 1, p->auth_cmpl.bda, 6);
        post_event(EV_AUTH, d, sizeof(d));
        break;
    }
    case ESP_BT_GAP_CFM_REQ_EVT:  // numeric comparison: the phone shows the number; accept only in the window
        esp_bt_gap_ssp_confirm_reply(p->cfm_req.bda, window_open);
        break;
    case ESP_BT_GAP_PIN_REQ_EVT: {
        esp_bt_pin_code_t pin = {'0', '0', '0', '0'};
        esp_bt_gap_pin_reply(p->pin_req.bda, window_open, 4, pin);
        break;
    }
    default:
        break;
    }
}

// ---- start -------------------------------------------------------------------------------------

static void load_nvs(void)
{
    nvs_handle_t h;
    if (nvs_open(NVS_NS, NVS_READONLY, &h) != ESP_OK) {
        return;
    }
    size_t len = DIALAUTH_KEY_LEN;
    S.key_ok = nvs_get_blob(h, "dialkey", S.key, &len) == ESP_OK && len == DIALAUTH_KEY_LEN;
    len = 6;
    S.have_peer = nvs_get_blob(h, "peer", S.peer, &len) == ESP_OK && len == 6;
    nvs_close(h);
}

static esp_err_t start_bluetooth(void)
{
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_BLE));
    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    esp_err_t err = esp_bt_controller_init(&bt_cfg);
    if (err == ESP_OK) {
        err = esp_bt_controller_enable(ESP_BT_MODE_CLASSIC_BT);
    }
    if (err == ESP_OK) {
        esp_bluedroid_config_t cfg = BT_BLUEDROID_INIT_CONFIG_DEFAULT();
        cfg.ssp_en = true;
        err = esp_bluedroid_init_with_cfg(&cfg);
    }
    if (err == ESP_OK) {
        err = esp_bluedroid_enable();
    }
    if (err != ESP_OK) {
        return err;
    }
    char name[32];
    const uint8_t *a = esp_bt_dev_get_address();
    snprintf(name, sizeof(name), "%s %02X%02X", CONFIG_UPDATA_DEVICE_NAME, a ? a[4] : 0, a ? a[5] : 0);
    esp_bt_gap_set_device_name(name);
    esp_bt_gap_register_callback(gap_cb);
    esp_bt_io_cap_t iocap = ESP_BT_IO_CAP_IO;
    esp_bt_gap_set_security_param(ESP_BT_SP_IOCAP_MODE, &iocap, sizeof(iocap));
    esp_hf_client_register_callback(hf_cb);
    err = esp_hf_client_init();
    if (err != ESP_OK) {
        return err;
    }
    // Reachable by the bonded phone, invisible to everyone else until the host opens a pairing window.
    esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_NON_DISCOVERABLE);
    return ESP_OK;
}

void bridge_start(void)
{
    S.signal = 0xFF;
    S.battery = 0xFF;
    S.reset_reason = (uint8_t)esp_reset_reason();
    ring_init(&s_up, s_up_store, sizeof(s_up_store));
    ring_init(&s_down, s_down_store, sizeof(s_down_store));
    dialpolicy_init(&s_policy, CONFIG_UPDATA_MIN_DIAL_INTERVAL_S * 1000u, CONFIG_UPDATA_MAX_DIALS_PER_HOUR);
    load_nvs();

    gpio_config_t btn = {.pin_bit_mask = 1ULL << BOOT_BUTTON, .mode = GPIO_MODE_INPUT, .pull_up_en = GPIO_PULLUP_ENABLE};
    gpio_config(&btn);

    uart_config_t uc = {
        .baud_rate = CONFIG_UPDATA_UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    ESP_ERROR_CHECK(uart_driver_install(UART_PORT, 8192, 8192, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(UART_PORT, &uc));
    // With ESP_CONSOLE_NONE, IDF 5.5's UART initialization parks an unassigned
    // RX signal high. Explicitly restore the DevKit's USB-UART pins after it.
    ESP_ERROR_CHECK(uart_set_pin(UART_PORT, U0TXD_GPIO_NUM, U0RXD_GPIO_NUM,
                                UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    s_txq = xQueueCreate(32, sizeof(txmsg_t));
    xTaskCreatePinnedToCore(tx_task, "updata_tx", 4096, NULL, 10, &s_tx_task, 1);
    xTaskCreatePinnedToCore(rx_task, "updata_rx", 4096, NULL, 11, NULL, 1);

    esp_chip_info_t chip;
    esp_chip_info(&chip);
    if (chip.model != CHIP_ESP32) {
        S.fault = true;  // Classic Bluetooth HFP needs the original ESP32
    } else if (start_bluetooth() == ESP_OK) {
        S.bt_ready = true;
    } else {
        S.fault = true;
    }
    post_event(EV_BOOT, &S.reset_reason, 1);
    state_changed();
}
