#include "ring.h"

#include <string.h>

void ring_init(ring_t *r, uint8_t *storage, size_t storage_len)
{
    r->buf = storage;
    r->cap = storage_len;
    r->head = 0;
    r->tail = 0;
}

size_t ring_used(const ring_t *r)
{
    size_t h = r->head, t = r->tail;
    return h >= t ? h - t : r->cap - t + h;
}

size_t ring_free(const ring_t *r)
{
    return r->cap - 1 - ring_used(r);
}

int ring_write(ring_t *r, const uint8_t *data, size_t len)
{
    if (len > ring_free(r)) {
        return 0;
    }
    size_t h = r->head;
    size_t first = r->cap - h < len ? r->cap - h : len;
    memcpy(r->buf + h, data, first);
    memcpy(r->buf, data + first, len - first);
    __atomic_store_n(&r->head, (h + len) % r->cap, __ATOMIC_RELEASE);
    return 1;
}

size_t ring_read(ring_t *r, uint8_t *out, size_t len)
{
    size_t used = ring_used(r);
    if (len > used) {
        len = used;
    }
    size_t t = r->tail;
    size_t first = r->cap - t < len ? r->cap - t : len;
    memcpy(out, r->buf + t, first);
    memcpy(out + first, r->buf, len - first);
    __atomic_store_n(&r->tail, (t + len) % r->cap, __ATOMIC_RELEASE);
    return len;
}

void ring_clear(ring_t *r)
{
    __atomic_store_n(&r->tail, r->head, __ATOMIC_RELEASE);
}
