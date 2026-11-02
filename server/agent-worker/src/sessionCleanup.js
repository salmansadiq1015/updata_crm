/** Stop provider work before uploads, then read the final cumulative snapshot. */
export async function closeVoiceSession(session, flush, onError = () => {}) {
  try { await session?.close(); } catch (error) { onError(error); }
  await flush();
  return session?.usage || null;
}
