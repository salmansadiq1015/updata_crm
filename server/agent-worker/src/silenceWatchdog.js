/** Per-question silence timer. Agent speech/thinking and caller speech never consume retries. */
export function createSilenceWatchdog({ timeoutMs, isBusy, onSilence, warn = () => {} }) {
  let timer = null;
  let stopped = false;
  let running = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const arm = () => {
    cancel();
    if (stopped || running) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped) return;
      if (isBusy()) { arm(); return; }
      running = true;
      try { await onSilence(); } catch (error) { warn(error); }
      finally { running = false; arm(); }
    }, timeoutMs);
    timer.unref?.();
  };
  return { arm, cancel, stop() { stopped = true; cancel(); } };
}
