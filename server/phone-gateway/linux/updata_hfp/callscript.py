"""The scripted audio-proof call, as a pure state machine driven by events and a clock.

  connect → preflight (phone idle) → dial → ringing → answered → audio link →
  listen (remote person says the test phrase) → speak (play the prompt) →
  after (remote person repeats what they heard) → hang up → done

`handle(event, **data)` and `tick(now)` return actions for the I/O layer:
  ('dial', number) · ('hangup',) · ('connect_sco',) · ('play',) · ('finish', outcome, detail)
  ('log', event, data)

It dials at most once. Any doubt about the call's real state after dialing ends in
`outcome_unknown`, never a second dial.
"""

DEFAULTS = {
    'slc_timeout_s': 20,
    'dial_ack_timeout_s': 10,  # the phone must report dialing/alerting/active by then
    'ring_timeout_s': 45,
    'audio_wait_s': 4,  # then we open the audio link ourselves
    'audio_fail_s': 12,  # no audio link at all by then → hang up
    'listen_s': 10,
    'after_s': 10,
    'speak_max_s': 30,
    'hangup_timeout_s': 10,
    'max_call_s': 120,
    'audio_grace_s': 2,  # phones close audio just before reporting a remote hang-up
}


class CallScript:
    def __init__(self, number, now, **options):
        self.number = number
        self.o = dict(DEFAULTS, **options)
        self.phase = 'connecting'
        self.phase_at = now
        self.dialed_at = None
        self.answered_at = None
        self.audio_at = None
        self.audio_open = False
        self.sco_requested = False
        self.audio_lost_at = None
        self.dialed = False
        self.outcome = None
        self.metrics = {}

    def _go(self, phase, now, **data):
        self.phase, self.phase_at = phase, now
        return [('log', 'script_phase', dict(phase=phase, **data))]

    def _finish(self, outcome, detail, now):
        self.outcome = outcome
        self.metrics['finished_at_s'] = round(now - self.dialed_at, 2) if self.dialed_at else None
        return self._go('done', now, outcome=outcome) + [('finish', outcome, detail)]

    def _hangup(self, now, outcome, detail):
        self.metrics['planned_outcome'] = outcome
        self.metrics['planned_detail'] = detail
        return self._go('hanging_up', now, reason=outcome) + [('hangup',)]

    def handle(self, event, now, **data):
        if self.phase == 'done':
            return []
        if event == 'slc_connected':
            if self.phase != 'connecting':
                return []
            state = data.get('call_state', 'idle')
            if state != 'idle':
                return self._finish('phone_busy', 'phone call state is %s; not dialing' % state, now)
            self.dialed, self.dialed_at = True, now
            return self._go('dialing', now) + [('dial', self.number)]
        if event == 'slc_failed':
            return self._finish('slc_failed', data.get('detail'), now)
        if event == 'dial_result' and self.phase == 'dialing' and not data.get('ok'):
            return self._finish('dial_rejected', data.get('detail'), now)
        if event == 'slc_lost':
            if self.dialed:
                return self._finish('outcome_unknown', 'control link lost after dialing', now)
            return self._finish('slc_failed', 'control link lost before dialing', now)
        if event == 'audio_opened':
            self.audio_open = True
            self.audio_lost_at = None
            if self.audio_at is None:
                self.audio_at = now
                if self.dialed_at is not None:
                    self.metrics['audio_after_dial_s'] = round(now - self.dialed_at, 2)
            if self.phase == 'waiting_audio':
                return self._go('listening', now)
            return []
        if event == 'audio_closed':
            self.audio_open = False
            if self.phase in ('listening', 'speaking', 'after'):
                self.audio_lost_at = now  # wait audio_grace_s: a remote hang-up closes audio first
                return [('log', 'script_audio_closed', {'phase': self.phase})]
            return []
        if event == 'prompt_done' and self.phase == 'speaking':
            self.metrics['prompt_s'] = round(now - self.phase_at, 2)
            return self._go('after', now)
        if event == 'call_state':
            return self._call_state(data['state'], now)
        return []

    def _call_state(self, state, now):
        p = self.phase
        if p == 'dialing' and state in ('dialing', 'alerting'):
            return self._go('ringing', now, state=state)
        if p in ('dialing', 'ringing') and state == 'active':
            self.answered_at = now
            self.metrics['setup_s'] = round(now - self.dialed_at, 2)
            if self.audio_open:
                return self._go('listening', now)
            return self._go('waiting_audio', now)
        if state == 'idle':
            if p == 'ringing':
                return self._finish('not_answered', 'call ended before it was answered (busy, rejected or no answer)', now)
            if p in ('waiting_audio', 'listening', 'speaking', 'after'):
                return self._finish('remote_hangup', 'call ended during the %s phase' % p, now)
            if p == 'hanging_up':
                return self._finish(self.metrics['planned_outcome'], self.metrics['planned_detail'], now)
        return []

    def tick(self, now):
        p, age = self.phase, now - self.phase_at
        o = self.o
        if p == 'done':
            return []
        if self.dialed_at is not None and now - self.dialed_at > o['max_call_s'] and p != 'hanging_up':
            return self._hangup(now, 'max_duration', 'call reached max_call_s')
        if p == 'connecting' and age > o['slc_timeout_s']:
            return self._finish('slc_failed', 'no service level connection after %ss' % o['slc_timeout_s'], now)
        if p == 'dialing' and age > o['dial_ack_timeout_s']:
            return self._hangup(now, 'dial_unconfirmed', 'phone never reported the outgoing call')
        if p == 'ringing' and age > o['ring_timeout_s']:
            return self._hangup(now, 'not_answered', 'no answer after %ss' % o['ring_timeout_s'])
        if p == 'waiting_audio':
            if age > o['audio_fail_s']:
                return self._hangup(now, 'audio_failed', 'no audio link %ss after answer' % o['audio_fail_s'])
            if age > o['audio_wait_s'] and not self.sco_requested:
                self.sco_requested = True
                return [('log', 'script_connect_sco', {}), ('connect_sco',)]
        if (self.audio_lost_at is not None and p in ('listening', 'speaking', 'after')
                and now - self.audio_lost_at > o['audio_grace_s']):
            self.audio_lost_at = None
            return self._hangup(now, 'audio_lost', 'audio link closed during the %s phase and the call stayed up' % p)
        if p == 'listening' and age > o['listen_s']:
            return self._go('speaking', now) + [('play',)]
        if p == 'speaking' and age > o['speak_max_s']:
            return self._go('after', now, note='prompt still playing at speak_max_s')
        if p == 'after' and age > o['after_s']:
            return self._hangup(now, 'completed', 'script finished; verify both directions from the evidence')
        if p == 'hanging_up' and age > o['hangup_timeout_s']:
            return self._finish('outcome_unknown', 'phone did not confirm the hang-up', now)
        return []
