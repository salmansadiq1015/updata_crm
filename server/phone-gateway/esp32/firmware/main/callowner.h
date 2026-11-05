// Who owns the phone's current call, and when the host may answer one (pure, host-tested).
//
// The host-lost watchdog must only end calls the HOST started (DIAL) or picked up (ANSWER).
// A ringing call the gateway left for a person, or a call the person answered on the handset,
// belongs to the person: a dead gateway must never reject or hang it up.
//
//   DIAL accepted            -> owned, not yet live (the phone has not reported the call)
//   ANSWER accepted          -> owned and live (the phone is already ringing)
//   call/callsetup non-zero  -> an owned call becomes live
//   both back to zero (live) -> released
//   call=0 + callsetup=1 and no ANSWER pending -> released: a ring nobody here answered (a new
//                            ring after a DIAL that never started, or a waiting call still ringing
//                            after the owned call ended) belongs to a person
//   dial refused by the phone, HFP lost, audio handed to the handset -> released
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "proto.h"

typedef struct {
    bool owned;  // the host started or answered the current call
    bool live;  // the phone has reported that owned call (call or callsetup non-zero)
    bool answering;  // ANSWER sent; the phone has not reported the call active yet
} callowner_t;

// answering: true for ANSWER (the phone is already ringing), false for DIAL.
static inline void callowner_claim(callowner_t *o, bool answering)
{
    o->owned = true;
    o->live = answering;
    o->answering = answering;
}

static inline void callowner_release(callowner_t *o)
{
    o->owned = false;
    o->live = false;
    o->answering = false;
}

// Apply the phone's +CIEV call/callsetup indicators after every change.
static inline void callowner_on_indicators(callowner_t *o, uint8_t call, uint8_t callsetup)
{
    if (!o->owned) {
        return;
    }
    if (!call && callsetup == 1 && !o->answering) {
        callowner_release(o);  // an incoming ring is never ours until the host answers it
        return;
    }
    if (call || callsetup) {
        o->live = true;
        if (call) {
            o->answering = false;
        }
    } else if (o->live) {
        callowner_release(o);
    }
}

// The watchdog ends a call only when the host owns it and the phone still has it.
static inline bool callowner_watchdog_should_end(const callowner_t *o, bool session_open, uint8_t call,
                                                 uint8_t callsetup, bool host_expired)
{
    return session_open && host_expired && o->owned && (call || callsetup);
}

// T_ANSWER policy (payload: u32 callRef, nonzero). Session is checked before dispatch.
static inline uint8_t answer_check(uint16_t len, uint32_t call_ref, bool hfp_slc, uint8_t call, uint8_t callsetup,
                                   bool dial_pending)
{
    if (len != 4 || call_ref == 0) {
        return R_BAD_ARG;
    }
    if (!hfp_slc || call != 0 || callsetup != 1 || dial_pending) {
        return R_BAD_STATE;  // only a plain incoming call; never call waiting, never mid-dial
    }
    return R_OK;
}
