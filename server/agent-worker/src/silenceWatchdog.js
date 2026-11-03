/** Audio-state timer; the silence threshold and cancellable repetition delay are separate. */
export function createSilenceWatchdog({ timeoutMs, repetitionDelayMs = 0, isBusy, onSilence, onDetected = () => {}, warn = () => {} }) {
  let timer = null;
  let stopped = false;
  let running = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const arm = () => {
    cancel();
    if (stopped || running) return;
    const retry = async () => {
      timer = null;
      if (stopped) return;
      if (isBusy()) { arm(); return; }
      running = true;
      try { await onSilence(); } catch (error) { warn(error); }
      finally { running = false; arm(); }
    };
    timer = setTimeout(() => {
      if (stopped) return;
      if (isBusy()) { arm(); return; }
      onDetected();
      if (repetitionDelayMs > 0) {
        timer = setTimeout(retry, repetitionDelayMs);
        timer.unref?.();
      } else void retry();
    }, timeoutMs);
    timer.unref?.();
  };
  return { arm, cancel, stop() { stopped = true; cancel(); } };
}
