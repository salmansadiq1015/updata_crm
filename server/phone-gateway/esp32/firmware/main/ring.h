// Single-producer/single-consumer byte ring for audio (pure C, host-tested).
// The SCO callbacks (Bluetooth task) and the USB task each own one side, so no lock is needed.
// Writes that do not fit are refused whole (counted by the caller as an overrun); reads that
// come up short are the caller's underrun.
#pragma once

#include <stddef.h>
#include <stdint.h>

typedef struct {
    uint8_t *buf;
    size_t cap;  // usable bytes = cap - 1
    volatile size_t head;  // written by producer
    volatile size_t tail;  // written by consumer
} ring_t;

void ring_init(ring_t *r, uint8_t *storage, size_t storage_len);
size_t ring_used(const ring_t *r);
size_t ring_free(const ring_t *r);
// All-or-nothing write. Returns 1 if written, 0 if there was not room for all of it.
int ring_write(ring_t *r, const uint8_t *data, size_t len);
// Reads up to len bytes; returns how many were read.
size_t ring_read(ring_t *r, uint8_t *out, size_t len);
// Consumer-side reset (drops everything queued).
void ring_clear(ring_t *r);
