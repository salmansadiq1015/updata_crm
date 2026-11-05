// Host unit tests for the firmware's pure modules: cc -Wall -Wextra -Werror, see run.sh.
// Frame and HMAC vectors are the same ones the JS gateway tests use (test/esp32.protocol.test.js).

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../main/callowner.h"
#include "../../main/dialauth.h"
#include "../../main/devstate.h"
#include "../../main/hostwatchdog.h"
#include "../../main/proto.h"
#include "../../main/ring.h"

static int failures, checks;

#define CHECK(cond)                                                       \
    do {                                                                  \
        checks++;                                                         \
        if (!(cond)) {                                                    \
            failures++;                                                   \
            fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); \
        }                                                                 \
    } while (0)

static size_t unhex(const char *hex, uint8_t *out)
{
    size_t n = strlen(hex) / 2;
    for (size_t i = 0; i < n; i++) {
        unsigned v;
        sscanf(hex + 2 * i, "%2x", &v);
        out[i] = (uint8_t)v;
    }
    return n;
}

static int feed(proto_decoder_t *d, const uint8_t *data, size_t len, proto_frame_t *frames, int max)
{
    int got = 0;
    proto_frame_t f;
    for (size_t i = 0; i < len; i++) {
        if (proto_decoder_push(d, data[i], &f) && got < max) {
            frames[got++] = f;
        }
    }
    return got;
}

static void test_crc_and_vectors(void)
{
    CHECK(proto_crc16((const uint8_t *)"123456789", 9) == 0x29B1);  // CRC-16/CCITT-FALSE check value
    uint8_t out[64], want[64];
    uint8_t hello[2] = {PROTO_MAJOR, PROTO_MINOR};
    size_t n = proto_encode(out, sizeof(out), T_HELLO, 1, hello, 2);
    CHECK(n == unhex("a55a010001000200010014ed", want) && memcmp(out, want, n) == 0);
    uint8_t tok[4];
    proto_wr32(tok, 0xdeadbeef);
    n = proto_encode(out, sizeof(out), T_PING, 0xfffe, tok, 4);
    CHECK(n == unhex("a55a0200feff0400efbeadde94bb", want) && memcmp(out, want, n) == 0);
    n = proto_encode(out, sizeof(out), T_STATUS_REQ, 7, NULL, 0);
    CHECK(n == unhex("a55a030007000000dd91", want) && memcmp(out, want, n) == 0);
    CHECK(proto_encode(out, 5, T_STATUS_REQ, 7, NULL, 0) == 0);  // does not fit
}

static void test_decoder_resync(void)
{
    uint8_t stream[256];
    size_t n = 0;
    const char *junk = "ets Jun  8 2016 rst:0x1\r\n";  // boot ROM text before the first frame
    memcpy(stream, junk, strlen(junk));
    n += strlen(junk);
    n += unhex("a55a010001000200010014ed", stream + n);
    size_t bad_at = n;
    n += unhex("a55a0200feff0400efbeadde94bb", stream + n);
    stream[bad_at + 9] ^= 0xFF;  // corrupt one payload byte of the PING frame
    stream[n++] = 0xA5;  // stray SOF byte
    n += unhex("a55a030007000000dd91", stream + n);

    proto_decoder_t d;
    proto_decoder_init(&d);
    proto_frame_t frames[4];
    int got = feed(&d, stream, n, frames, 4);
    CHECK(got == 2);
    CHECK(frames[0].type == T_HELLO && frames[0].seq == 1 && frames[0].len == 2);
    CHECK(frames[1].type == T_STATUS_REQ && frames[1].seq == 7 && frames[1].len == 0);
    CHECK(d.crc_errors == 1);
    CHECK(d.junk_bytes >= strlen(junk));
}

static void test_decoder_rejects_oversize(void)
{
    uint8_t hdr[8] = {0xA5, 0x5A, T_AUDIO_DOWN, 0, 0, 0, 0xFF, 0xFF};  // len 65535
    uint8_t good[16];
    size_t gn = unhex("a55a030007000000dd91", good);
    proto_decoder_t d;
    proto_decoder_init(&d);
    proto_frame_t frames[2];
    int got = feed(&d, hdr, sizeof(hdr), frames, 2);
    got += feed(&d, good, gn, frames, 2);
    CHECK(got == 1 && frames[0].type == T_STATUS_REQ);
    CHECK(d.oversize >= 1);
}

static void test_max_payload_roundtrip(void)
{
    static uint8_t payload[PROTO_MAX_PAYLOAD], wire[PROTO_MAX_FRAME];
    for (int i = 0; i < PROTO_MAX_PAYLOAD; i++) {
        payload[i] = (uint8_t)(i * 7);
    }
    size_t n = proto_encode(wire, sizeof(wire), T_AUDIO_UP, 42, payload, PROTO_MAX_PAYLOAD);
    CHECK(n == PROTO_MAX_FRAME);
    CHECK(proto_encode(wire, sizeof(wire), T_AUDIO_UP, 42, payload, PROTO_MAX_PAYLOAD + 1) == 0);
    proto_decoder_t d;
    proto_decoder_init(&d);
    proto_frame_t f[1];
    CHECK(feed(&d, wire, n, f, 1) == 1 && f[0].len == PROTO_MAX_PAYLOAD && memcmp(f[0].payload, payload, PROTO_MAX_PAYLOAD) == 0);
}

static void test_sha_hmac(void)
{
    uint8_t out[32], want[32];
    updata_sha256((const uint8_t *)"abc", 3, out);
    unhex("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", want);
    CHECK(memcmp(out, want, 32) == 0);
    // RFC 4231 test case 2
    updata_hmac_sha256((const uint8_t *)"Jefe", 4, (const uint8_t *)"what do ya want for nothing?", 28, out);
    unhex("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843", want);
    CHECK(memcmp(out, want, 32) == 0);
    // RFC 4231 test case 6 (key longer than the block)
    uint8_t longkey[131];
    memset(longkey, 0xaa, sizeof(longkey));
    const char *m6 = "Test Using Larger Than Block-Size Key - Hash Key First";
    updata_hmac_sha256(longkey, sizeof(longkey), (const uint8_t *)m6, strlen(m6), out);
    unhex("60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54", want);
    CHECK(memcmp(out, want, 32) == 0);
}

static void test_dialauth(void)
{
    uint8_t key[32], nonce[16], mac[32];
    for (int i = 0; i < 32; i++) {
        key[i] = (uint8_t)i;
    }
    unhex("00112233445566778899aabbccddeeff", nonce);
    unhex("3d83fa64eae811a1db5ee6c88ff587696651f8bdd2a97b276e0eeeaf0d222d9e", mac);  // from dialAuth.js
    const char *num = "+923001234567";
    CHECK(dialauth_verify(key, nonce, 1, 42, num, strlen(num), mac));
    CHECK(!dialauth_verify(key, nonce, 2, 42, num, strlen(num), mac));  // other counter
    CHECK(!dialauth_verify(key, nonce, 1, 43, num, strlen(num), mac));  // other call
    CHECK(!dialauth_verify(key, nonce, 1, 42, "+923001234568", 13, mac));  // other number
    nonce[0] ^= 1;
    CHECK(!dialauth_verify(key, nonce, 1, 42, num, strlen(num), mac));  // other session
    CHECK(dialauth_number_ok("03001234567", 11));
    CHECK(dialauth_number_ok("+92300", 6));
    CHECK(!dialauth_number_ok("12", 2));
    CHECK(!dialauth_number_ok("+", 1));
    CHECK(!dialauth_number_ok("*#06#", 5));
    CHECK(!dialauth_number_ok("0300;ATH", 8));
    CHECK(!dialauth_number_ok("123456789012345678901", 21));
}

static void test_dialpolicy(void)
{
    dialpolicy_t p;
    dialpolicy_init(&p, 20000, 3);
    dialpolicy_ctx_t ok = {true, true, true, true};
    dialpolicy_ctx_t c = ok;
    c.session_open = false;
    CHECK(dialpolicy_check(&p, &c, 1, 0) == R_NO_SESSION);
    c = ok;
    c.key_provisioned = false;
    CHECK(dialpolicy_check(&p, &c, 1, 0) == R_NOT_PROVISIONED);
    c = ok;
    c.hfp_ready = false;
    CHECK(dialpolicy_check(&p, &c, 1, 0) == R_BAD_STATE);
    c = ok;
    c.call_idle = false;
    CHECK(dialpolicy_check(&p, &c, 1, 0) == R_BUSY);
    CHECK(dialpolicy_check(&p, &ok, 0, 0) == R_UNAUTHORIZED);  // counter must start above 0
    CHECK(dialpolicy_check(&p, &ok, 1, 1000) == R_OK);
    dialpolicy_commit(&p, 1, 1000);
    CHECK(dialpolicy_check(&p, &ok, 1, 60000) == R_UNAUTHORIZED);  // replayed counter
    CHECK(dialpolicy_check(&p, &ok, 2, 15000) == R_RATE_LIMITED);  // within 20 s
    CHECK(dialpolicy_check(&p, &ok, 2, 21000) == R_OK);
    dialpolicy_commit(&p, 2, 21000);
    dialpolicy_commit(&p, 3, 42000);
    CHECK(dialpolicy_check(&p, &ok, 4, 70000) == R_RATE_LIMITED);  // 3 per hour used
    CHECK(dialpolicy_check(&p, &ok, 4, 1000 + 3600000) == R_OK);  // first one aged out
    dialpolicy_new_session(&p);
    CHECK(p.last_counter == 0 && p.history_len == 3);  // rate history survives a new session
    dialpolicy_t z;
    dialpolicy_init(&z, 0, 0);
    CHECK(dialpolicy_check(&z, &ok, 1, 0) == R_RATE_LIMITED);  // cap 0 = dialing disabled
}

static void test_ring(void)
{
    uint8_t store[8], out[8];
    ring_t r;
    ring_init(&r, store, sizeof(store));
    CHECK(ring_free(&r) == 7);
    CHECK(ring_write(&r, (const uint8_t *)"abcde", 5));
    CHECK(!ring_write(&r, (const uint8_t *)"xyz", 3));  // all-or-nothing
    CHECK(ring_read(&r, out, 3) == 3 && memcmp(out, "abc", 3) == 0);
    CHECK(ring_write(&r, (const uint8_t *)"fghij", 5));  // wraps
    CHECK(ring_used(&r) == 7);
    CHECK(ring_read(&r, out, 8) == 7 && memcmp(out, "defghij", 7) == 0);
    CHECK(ring_read(&r, out, 4) == 0);  // underrun
    CHECK(ring_write(&r, (const uint8_t *)"kl", 2));
    ring_clear(&r);
    CHECK(ring_used(&r) == 0);
}

static void test_devstate(void)
{
    devstate_in_t s = {0};
    CHECK(devstate_derive(&s) == DS_BOOTING);
    s.session_open = true;
    CHECK(devstate_derive(&s) == DS_USB_READY);
    s.bt_ready = true;
    CHECK(devstate_derive(&s) == DS_BT_READY);
    s.hfp = HFP_CONNECTED;
    CHECK(devstate_derive(&s) == DS_PHONE_CONNECTED);
    s.hfp = HFP_SLC;
    CHECK(devstate_derive(&s) == DS_HFP_READY);
    s.callsetup = 3;
    CHECK(devstate_derive(&s) == DS_CALL_ACTIVE);
    s.audio = AUDIO_ON;  // in-band ringback: audio before answer is still not "audio ready"
    CHECK(devstate_derive(&s) == DS_CALL_ACTIVE);
    s.call = 1;
    s.callsetup = 0;
    CHECK(devstate_derive(&s) == DS_AUDIO_READY);
    s.audio = AUDIO_OFF;  // call up, audio lost
    CHECK(devstate_derive(&s) == DS_CALL_ACTIVE);
    s.call = 0;
    s.recently_ended = true;
    CHECK(devstate_derive(&s) == DS_CALL_ENDED);
    s.fault = true;
    CHECK(devstate_derive(&s) == DS_FAULT);
}

static void test_callowner(void)
{
    callowner_t o = {0};
    // A ringing call nobody answered, and a call a person picked up, are never host-owned.
    callowner_on_indicators(&o, 0, 1);
    CHECK(!o.owned);
    CHECK(!callowner_watchdog_should_end(&o, true, 0, 1, true));
    callowner_on_indicators(&o, 1, 0);
    CHECK(!callowner_watchdog_should_end(&o, true, 1, 0, true));
    callowner_on_indicators(&o, 0, 0);

    // Outbound: DIAL owns the call before the phone reports it, through to the end.
    callowner_claim(&o, false);
    callowner_on_indicators(&o, 0, 0);  // indicator noise before setup must not release it
    CHECK(o.owned && !o.live);
    callowner_on_indicators(&o, 0, 2);
    CHECK(o.owned && o.live);
    callowner_on_indicators(&o, 1, 0);
    CHECK(callowner_watchdog_should_end(&o, true, 1, 0, true));
    CHECK(!callowner_watchdog_should_end(&o, true, 1, 0, false));  // host still talking
    CHECK(!callowner_watchdog_should_end(&o, false, 1, 0, true));  // session already closed
    callowner_on_indicators(&o, 0, 0);
    CHECK(!o.owned && !o.live);
    // ...so the next ring, left for a person, survives a dead host.
    callowner_on_indicators(&o, 0, 1);
    CHECK(!callowner_watchdog_should_end(&o, true, 0, 1, true));

    // A DIAL the phone never started does not own a later incoming ring.
    callowner_claim(&o, false);
    callowner_on_indicators(&o, 0, 1);
    CHECK(!o.owned);

    // Inbound: ANSWER owns the ringing call; it stays owned while it becomes active.
    callowner_claim(&o, true);
    CHECK(callowner_watchdog_should_end(&o, true, 0, 1, true));
    callowner_on_indicators(&o, 1, 1);  // +CIEV call=1 before callsetup=0
    callowner_on_indicators(&o, 1, 0);
    CHECK(callowner_watchdog_should_end(&o, true, 1, 0, true));
    callowner_release(&o);  // audio handed to the handset (takeover)
    CHECK(!callowner_watchdog_should_end(&o, true, 1, 0, true));

    // Call waiting behind an owned call: the owned call stays owned; once it ends, the waiting call
    // ringing on its own belongs to a person (never rejected by the watchdog).
    callowner_claim(&o, true);
    callowner_on_indicators(&o, 1, 0);
    callowner_on_indicators(&o, 1, 1);  // +CCWA: second call waiting
    CHECK(callowner_watchdog_should_end(&o, true, 1, 1, true));
    callowner_on_indicators(&o, 0, 1);  // the owned call ended; the waiting call rings alone
    CHECK(!o.owned);
    CHECK(!callowner_watchdog_should_end(&o, true, 0, 1, true));
    // Same after an outbound call.
    callowner_claim(&o, false);
    callowner_on_indicators(&o, 0, 2);
    callowner_on_indicators(&o, 1, 0);
    callowner_on_indicators(&o, 1, 1);
    CHECK(o.owned);
    callowner_on_indicators(&o, 0, 1);
    CHECK(!o.owned);
    // ANSWER pending: ring indicators repeated before call=1 do not release it.
    callowner_claim(&o, true);
    callowner_on_indicators(&o, 0, 1);
    CHECK(o.owned && o.answering);
    callowner_on_indicators(&o, 1, 0);
    CHECK(o.owned && !o.answering);
    callowner_release(&o);

    // ANSWER policy.
    CHECK(answer_check(4, 7, true, 0, 1, false) == R_OK);
    CHECK(answer_check(3, 7, true, 0, 1, false) == R_BAD_ARG);
    CHECK(answer_check(4, 0, true, 0, 1, false) == R_BAD_ARG);
    CHECK(answer_check(4, 7, false, 0, 1, false) == R_BAD_STATE);  // no service level connection
    CHECK(answer_check(4, 7, true, 0, 0, false) == R_BAD_STATE);  // nothing ringing
    CHECK(answer_check(4, 7, true, 0, 2, false) == R_BAD_STATE);  // outgoing, not incoming
    CHECK(answer_check(4, 7, true, 1, 1, false) == R_BAD_STATE);  // call waiting: left to the phone
    CHECK(answer_check(4, 7, true, 0, 1, true) == R_BAD_STATE);  // a dial is in flight
}

int main(void)
{
    CHECK(!hostwatchdog_expired(1000, 1001, 5000)); // RX updated after the TX clock snapshot
    CHECK(!hostwatchdog_expired(1000, 1000, 5000));
    CHECK(!hostwatchdog_expired(6000, 1000, 5000)); // threshold is not exceeded
    CHECK(hostwatchdog_expired(6001, 1000, 5000));
    CHECK(!hostwatchdog_expired(100, UINT32_MAX - 100, 5000)); // real timer wrap
    CHECK(hostwatchdog_expired(6000, UINT32_MAX - 100, 5000));
    test_devstate();
    test_callowner();
    test_crc_and_vectors();
    test_decoder_resync();
    test_decoder_rejects_oversize();
    test_max_payload_roundtrip();
    test_sha_hmac();
    test_dialauth();
    test_dialpolicy();
    test_ring();
    printf("firmware host tests: %d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
