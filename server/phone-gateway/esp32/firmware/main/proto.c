#include "proto.h"

#include <string.h>

uint16_t proto_crc16(const uint8_t *data, size_t n)
{
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < n; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (int b = 0; b < 8; b++) {
            crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
        }
    }
    return crc;
}

size_t proto_encode(uint8_t *out, size_t cap, uint8_t type, uint16_t seq, const uint8_t *payload, uint16_t len)
{
    size_t total = PROTO_HEADER + (size_t)len + PROTO_CRC;
    if (len > PROTO_MAX_PAYLOAD || total > cap) {
        return 0;
    }
    out[0] = PROTO_SOF0;
    out[1] = PROTO_SOF1;
    out[2] = type;
    out[3] = 0;
    proto_wr16(out + 4, seq);
    proto_wr16(out + 6, len);
    if (len) {
        memcpy(out + PROTO_HEADER, payload, len);
    }
    proto_wr16(out + PROTO_HEADER + len, proto_crc16(out + 2, PROTO_HEADER - 2 + (size_t)len));
    return total;
}

void proto_decoder_init(proto_decoder_t *d)
{
    memset(d, 0, sizeof(*d));
}

static void drop(proto_decoder_t *d, size_t n)
{
    if (n >= d->have) {
        d->have = 0;
        return;
    }
    memmove(d->buf, d->buf + n, d->have - n);
    d->have -= n;
}

static int parse(proto_decoder_t *d, proto_frame_t *out)
{
    for (;;) {
        // Align to A5 5A (an A5 as the last byte may still become a start of frame).
        size_t i = 0;
        while (i < d->have && !(d->buf[i] == PROTO_SOF0 && (i + 1 >= d->have || d->buf[i + 1] == PROTO_SOF1))) {
            i++;
        }
        if (i) {
            d->junk_bytes += (uint32_t)i;
            drop(d, i);
        }
        if (d->have < PROTO_HEADER) {
            return 0;
        }
        uint16_t len = proto_rd16(d->buf + 6);
        if (len > PROTO_MAX_PAYLOAD) {
            d->oversize++;
            d->resyncs++;
            drop(d, 1);
            continue;
        }
        size_t total = PROTO_HEADER + (size_t)len + PROTO_CRC;
        if (d->have < total) {
            return 0;
        }
        if (proto_crc16(d->buf + 2, PROTO_HEADER - 2 + (size_t)len) != proto_rd16(d->buf + PROTO_HEADER + len)) {
            d->crc_errors++;
            d->resyncs++;
            drop(d, 1);
            continue;
        }
        out->type = d->buf[2];
        out->flags = d->buf[3];
        out->seq = proto_rd16(d->buf + 4);
        out->len = len;
        memcpy(out->payload, d->buf + PROTO_HEADER, len);
        d->frames++;
        drop(d, total);
        return 1;
    }
}

int proto_decoder_push(proto_decoder_t *d, uint8_t byte, proto_frame_t *out)
{
    if (d->have == sizeof(d->buf)) {  // cannot happen with the length check, but never overflow
        drop(d, 1);
    }
    d->buf[d->have++] = byte;
    return parse(d, out);
}
