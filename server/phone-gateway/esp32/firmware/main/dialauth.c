#include "dialauth.h"

#include <stdio.h>
#include <string.h>

#include "proto.h"

// ---- SHA-256 (FIPS 180-4) ----------------------------------------------------------------------

static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

typedef struct {
    uint32_t h[8];
    uint8_t block[64];
    size_t fill;
    uint64_t total;
} sha256_ctx;

static void sha256_block(sha256_ctx *c, const uint8_t *p)
{
    uint32_t w[64];
    for (int i = 0; i < 16; i++) {
        w[i] = ((uint32_t)p[4 * i] << 24) | ((uint32_t)p[4 * i + 1] << 16) | ((uint32_t)p[4 * i + 2] << 8) | p[4 * i + 3];
    }
    for (int i = 16; i < 64; i++) {
        uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = c->h[0], b = c->h[1], cc = c->h[2], d = c->h[3], e = c->h[4], f = c->h[5], g = c->h[6], h = c->h[7];
    for (int i = 0; i < 64; i++) {
        uint32_t t1 = h + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
        uint32_t t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & b) ^ (a & cc) ^ (b & cc));
        h = g; g = f; f = e; e = d + t1; d = cc; cc = b; b = a; a = t1 + t2;
    }
    c->h[0] += a; c->h[1] += b; c->h[2] += cc; c->h[3] += d; c->h[4] += e; c->h[5] += f; c->h[6] += g; c->h[7] += h;
}

static void sha256_init(sha256_ctx *c)
{
    static const uint32_t H0[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                   0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    memcpy(c->h, H0, sizeof(H0));
    c->fill = 0;
    c->total = 0;
}

static void sha256_update(sha256_ctx *c, const uint8_t *data, size_t len)
{
    c->total += len;
    while (len) {
        size_t n = 64 - c->fill < len ? 64 - c->fill : len;
        memcpy(c->block + c->fill, data, n);
        c->fill += n;
        data += n;
        len -= n;
        if (c->fill == 64) {
            sha256_block(c, c->block);
            c->fill = 0;
        }
    }
}

static void sha256_final(sha256_ctx *c, uint8_t out[32])
{
    uint64_t bits = c->total * 8;
    uint8_t pad = 0x80;
    sha256_update(c, &pad, 1);
    pad = 0;
    while (c->fill != 56) {
        sha256_update(c, &pad, 1);
    }
    uint8_t len[8];
    for (int i = 0; i < 8; i++) {
        len[i] = (uint8_t)(bits >> (56 - 8 * i));
    }
    sha256_update(c, len, 8);
    for (int i = 0; i < 8; i++) {
        out[4 * i] = (uint8_t)(c->h[i] >> 24);
        out[4 * i + 1] = (uint8_t)(c->h[i] >> 16);
        out[4 * i + 2] = (uint8_t)(c->h[i] >> 8);
        out[4 * i + 3] = (uint8_t)c->h[i];
    }
}

void updata_sha256(const uint8_t *data, size_t len, uint8_t out[32])
{
    sha256_ctx c;
    sha256_init(&c);
    sha256_update(&c, data, len);
    sha256_final(&c, out);
}

void updata_hmac_sha256(const uint8_t *key, size_t key_len, const uint8_t *msg, size_t msg_len, uint8_t out[32])
{
    uint8_t k[64] = {0};
    if (key_len > 64) {
        updata_sha256(key, key_len, k);
    } else {
        memcpy(k, key, key_len);
    }
    uint8_t pad[64];
    uint8_t inner[32];
    sha256_ctx c;
    for (int i = 0; i < 64; i++) {
        pad[i] = k[i] ^ 0x36;
    }
    sha256_init(&c);
    sha256_update(&c, pad, 64);
    sha256_update(&c, msg, msg_len);
    sha256_final(&c, inner);
    for (int i = 0; i < 64; i++) {
        pad[i] = k[i] ^ 0x5c;
    }
    sha256_init(&c);
    sha256_update(&c, pad, 64);
    sha256_update(&c, inner, 32);
    sha256_final(&c, out);
}

// ---- dial authorization ------------------------------------------------------------------------

bool dialauth_number_ok(const char *number, size_t len)
{
    size_t i = 0;
    if (len && number[0] == '+') {
        i = 1;
    }
    size_t digits = len - i;
    if (digits < 3 || digits > DIALAUTH_MAX_NUMBER) {
        return false;
    }
    for (; i < len; i++) {
        if (number[i] < '0' || number[i] > '9') {
            return false;
        }
    }
    return true;
}

bool dialauth_verify(const uint8_t key[DIALAUTH_KEY_LEN], const uint8_t nonce[DIALAUTH_NONCE_LEN], uint32_t counter,
                     uint32_t call_ref, const char *number, size_t number_len, const uint8_t mac[DIALAUTH_MAC_LEN])
{
    if (!dialauth_number_ok(number, number_len)) {
        return false;
    }
    char msg[128];
    char hex[2 * DIALAUTH_NONCE_LEN + 1];
    for (int i = 0; i < DIALAUTH_NONCE_LEN; i++) {
        snprintf(hex + 2 * i, 3, "%02x", nonce[i]);
    }
    int n = snprintf(msg, sizeof(msg), "updata-dial-v1|%s|%lu|%lu|%.*s", hex, (unsigned long)counter,
                     (unsigned long)call_ref, (int)number_len, number);
    if (n <= 0 || (size_t)n >= sizeof(msg)) {
        return false;
    }
    uint8_t want[32];
    updata_hmac_sha256(key, DIALAUTH_KEY_LEN, (const uint8_t *)msg, (size_t)n, want);
    uint8_t diff = 0;
    for (int i = 0; i < 32; i++) {
        diff |= (uint8_t)(want[i] ^ mac[i]);
    }
    return diff == 0;
}

// ---- dial policy -------------------------------------------------------------------------------

void dialpolicy_init(dialpolicy_t *p, uint32_t min_interval_ms, uint32_t max_per_hour)
{
    memset(p, 0, sizeof(*p));
    p->min_interval_ms = min_interval_ms;
    p->max_per_hour = max_per_hour > DIALPOLICY_WINDOW ? DIALPOLICY_WINDOW : max_per_hour;
}

void dialpolicy_new_session(dialpolicy_t *p)
{
    p->last_counter = 0;  // history (rate limits) survives sessions on purpose
}

static uint32_t recent(const dialpolicy_t *p, uint32_t now_ms, uint32_t within_ms, uint32_t *newest)
{
    uint32_t count = 0;
    *newest = 0;
    for (uint32_t i = 0; i < p->history_len; i++) {
        uint32_t t = p->history[(p->history_head + DIALPOLICY_WINDOW - 1 - i) % DIALPOLICY_WINDOW];
        if (i == 0) {
            *newest = t;
        }
        if (now_ms - t < within_ms) {  // unsigned math survives the 49-day wrap
            count++;
        }
    }
    return count;
}

int dialpolicy_check(const dialpolicy_t *p, const dialpolicy_ctx_t *ctx, uint32_t counter, uint32_t now_ms)
{
    if (!ctx->session_open) {
        return R_NO_SESSION;
    }
    if (!ctx->key_provisioned) {
        return R_NOT_PROVISIONED;
    }
    if (counter <= p->last_counter) {
        return R_UNAUTHORIZED;
    }
    if (!ctx->hfp_ready) {
        return R_BAD_STATE;
    }
    if (!ctx->call_idle) {
        return R_BUSY;
    }
    uint32_t newest;
    uint32_t in_hour = recent(p, now_ms, 3600u * 1000u, &newest);
    if (p->history_len && now_ms - newest < p->min_interval_ms) {
        return R_RATE_LIMITED;
    }
    if (p->max_per_hour == 0 || in_hour >= p->max_per_hour) {
        return R_RATE_LIMITED;
    }
    return R_OK;
}

void dialpolicy_commit(dialpolicy_t *p, uint32_t counter, uint32_t now_ms)
{
    p->last_counter = counter;
    p->history[p->history_head] = now_ms;
    p->history_head = (p->history_head + 1) % DIALPOLICY_WINDOW;
    if (p->history_len < DIALPOLICY_WINDOW) {
        p->history_len++;
    }
}
