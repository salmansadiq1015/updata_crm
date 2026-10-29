#pragma once

#include <stdbool.h>
#include <stdint.h>

// UART RX can update last_rx after TX snapshots now. That small future timestamp
// must not become a ~49-day unsigned delay and terminate a healthy call. Valid
// watchdog intervals are below half the uint32 clock range; real wrap still works.
static inline bool hostwatchdog_expired(uint32_t now, uint32_t last_rx, uint32_t timeout_ms)
{
    const uint32_t elapsed = now - last_rx;
    return elapsed < UINT32_C(0x80000000) && elapsed > timeout_ms;
}
