// Updata ESP32 HFP bridge: USB serial frame protocol v1 (firmware side).
// Spec: docs/paired-phone/USB-AUDIO-PROTOCOL.md. Host twin: src/esp32/protocol.js.
// Pure C, no ESP-IDF dependency, so it is unit-tested on the host (test/host).
#pragma once

#include <stddef.h>
#include <stdint.h>

#define PROTO_SOF0 0xA5
#define PROTO_SOF1 0x5A
#define PROTO_HEADER 8
#define PROTO_CRC 2
#define PROTO_MAX_PAYLOAD 1024
#define PROTO_MAX_FRAME (PROTO_HEADER + PROTO_MAX_PAYLOAD + PROTO_CRC)
#define PROTO_MAJOR 1
#define PROTO_MINOR 0

enum proto_type {
    // host -> device
    T_HELLO = 0x01,
    T_PING = 0x02,
    T_STATUS_REQ = 0x03,
    T_HFP_CONNECT = 0x10,
    T_HFP_DISCONNECT = 0x11,
    T_SET_DISCOVERABLE = 0x12,
    T_DIAL = 0x20,
    T_HANGUP = 0x21,
    T_AUDIO_CONNECT = 0x22,
    T_AUDIO_DISCONNECT = 0x23,
    T_DTMF = 0x24,
    T_VOLUME = 0x25,
    T_PROVISION_KEY = 0x30,
    T_AUDIO_DOWN = 0x40,
    // device -> host
    T_HELLO_ACK = 0x81,
    T_ACK = 0x82,
    T_STATE = 0x83,
    T_EVENT = 0x84,
    T_STATS = 0x85,
    T_LOG = 0x86,
    T_PONG = 0x87,
    T_AUDIO_UP = 0xC0,
};

enum proto_result {
    R_OK = 0,
    R_BAD_FRAME = 1,
    R_UNKNOWN_TYPE = 2,
    R_BAD_STATE = 3,
    R_BAD_ARG = 4,
    R_UNAUTHORIZED = 5,
    R_RATE_LIMITED = 6,
    R_BUSY = 7,
    R_NOT_PROVISIONED = 8,
    R_STACK_ERROR = 9,
    R_NO_SESSION = 10,
    R_NO_PRESENCE = 11,
};

enum proto_event {
    EV_RING = 1,
    EV_CLIP = 2,
    EV_CALL_FAILED = 3,
    EV_VOLUME = 4,
    EV_AUTH = 5,
    EV_DIAL_RESULT = 6,
    EV_HOST_LOST_HANGUP = 7,
    EV_BOOT = 8,
};

typedef struct {
    uint8_t type;
    uint8_t flags;
    uint16_t seq;
    uint16_t len;
    uint8_t payload[PROTO_MAX_PAYLOAD];
} proto_frame_t;

typedef struct {
    uint8_t buf[PROTO_MAX_FRAME];
    size_t have;
    uint32_t frames, crc_errors, resyncs, junk_bytes, oversize;
} proto_decoder_t;

uint16_t proto_crc16(const uint8_t *data, size_t n);

// Writes one frame into out; returns its length, or 0 if it does not fit / payload too large.
size_t proto_encode(uint8_t *out, size_t cap, uint8_t type, uint16_t seq, const uint8_t *payload, uint16_t len);

void proto_decoder_init(proto_decoder_t *d);

// Feed one received byte. Returns 1 and fills *out when a complete, CRC-valid frame ends here.
int proto_decoder_push(proto_decoder_t *d, uint8_t byte, proto_frame_t *out);

static inline uint16_t proto_rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static inline uint32_t proto_rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
static inline void proto_wr16(uint8_t *p, uint16_t v) { p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); }
static inline void proto_wr32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)v; p[1] = (uint8_t)(v >> 8); p[2] = (uint8_t)(v >> 16); p[3] = (uint8_t)(v >> 24);
}
