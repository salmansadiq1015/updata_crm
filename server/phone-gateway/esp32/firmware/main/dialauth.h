// Dial authorization and dial policy (pure C, host-tested). Host twin: src/esp32/dialAuth.js.
//
// A DIAL is accepted only if:
//   - a host session is open (HELLO received; it minted a fresh 16-byte nonce),
//   - a device key was provisioned (physical BOOT-button presence),
//   - mac == HMAC-SHA256(key, "updata-dial-v1|<nonce hex>|<counter>|<call_ref>|<number>"),
//   - counter > the last accepted counter in this session (no replay),
//   - the number is +?[0-9]{3,20},
//   - the phone link is ready and no call is up,
//   - the minimum interval and hourly cap are respected.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DIALAUTH_KEY_LEN 32
#define DIALAUTH_NONCE_LEN 16
#define DIALAUTH_MAC_LEN 32
#define DIALAUTH_MAX_NUMBER 20
#define DIALPOLICY_WINDOW 64  // max calls/hour this build can track

void updata_sha256(const uint8_t *data, size_t len, uint8_t out[32]);
void updata_hmac_sha256(const uint8_t *key, size_t key_len, const uint8_t *msg, size_t msg_len, uint8_t out[32]);

bool dialauth_number_ok(const char *number, size_t len);

// Returns true when mac matches. Constant-time comparison.
bool dialauth_verify(const uint8_t key[DIALAUTH_KEY_LEN], const uint8_t nonce[DIALAUTH_NONCE_LEN], uint32_t counter,
                     uint32_t call_ref, const char *number, size_t number_len, const uint8_t mac[DIALAUTH_MAC_LEN]);

typedef struct {
    uint32_t min_interval_ms;
    uint32_t max_per_hour;
    uint32_t last_counter;  // reset to 0 by each HELLO
    uint32_t history[DIALPOLICY_WINDOW];  // accepted dial times (ms), ring
    uint32_t history_len;
    uint32_t history_head;
} dialpolicy_t;

typedef struct {
    bool session_open;
    bool key_provisioned;
    bool hfp_ready;
    bool call_idle;
} dialpolicy_ctx_t;

void dialpolicy_init(dialpolicy_t *p, uint32_t min_interval_ms, uint32_t max_per_hour);
void dialpolicy_new_session(dialpolicy_t *p);

// Checks everything except the MAC. Returns a proto_result code (R_OK when allowed).
int dialpolicy_check(const dialpolicy_t *p, const dialpolicy_ctx_t *ctx, uint32_t counter, uint32_t now_ms);

// Record an accepted dial (after the MAC verified and the stack took the command).
void dialpolicy_commit(dialpolicy_t *p, uint32_t counter, uint32_t now_ms);
