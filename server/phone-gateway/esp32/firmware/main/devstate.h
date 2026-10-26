// Device state reported to the host (pure, host-tested). Keeps "phone connected", "ready to
// dial", "call up" and "call audio flowing" apart, so the host never treats a Bluetooth link
// or an active call as proof that audio works.
#pragma once

#include <stdbool.h>
#include <stdint.h>

enum dev_state {
    DS_BOOTING = 0,
    DS_USB_READY = 1,  // host session open, Bluetooth not up yet
    DS_BT_READY = 2,  // Bluetooth stack up, no phone link
    DS_PHONE_CONNECTED = 3,  // HFP RFCOMM up, service-level connection not finished
    DS_HFP_READY = 4,  // service-level connection up, no call: dialing allowed
    DS_CALL_ACTIVE = 5,  // dialing, ringing or answered, no audio link yet
    DS_AUDIO_READY = 6,  // call answered AND the SCO audio link is open
    DS_CALL_ENDED = 7,  // shown for a short time after a call ends
    DS_FAULT = 8,
};

enum hfp_link { HFP_DISCONNECTED = 0, HFP_CONNECTING = 1, HFP_CONNECTED = 2, HFP_SLC = 3 };
enum audio_link { AUDIO_OFF = 0, AUDIO_CONNECTING = 1, AUDIO_ON = 2 };

typedef struct {
    bool fault;
    bool session_open;
    bool bt_ready;
    uint8_t hfp;  // enum hfp_link
    uint8_t call;  // 0/1 (+CIEV call)
    uint8_t callsetup;  // 0..3
    uint8_t audio;  // enum audio_link
    bool recently_ended;
} devstate_in_t;

static inline uint8_t devstate_derive(const devstate_in_t *s)
{
    if (s->fault) {
        return DS_FAULT;
    }
    if (!s->bt_ready) {
        return s->session_open ? DS_USB_READY : DS_BOOTING;
    }
    if (s->hfp == HFP_DISCONNECTED || s->hfp == HFP_CONNECTING) {
        return DS_BT_READY;
    }
    if (s->hfp == HFP_CONNECTED) {
        return DS_PHONE_CONNECTED;
    }
    if (s->call == 1 && s->audio == AUDIO_ON) {
        return DS_AUDIO_READY;
    }
    if (s->call == 1 || s->callsetup != 0) {
        return DS_CALL_ACTIVE;
    }
    return s->recently_ended ? DS_CALL_ENDED : DS_HFP_READY;
}
