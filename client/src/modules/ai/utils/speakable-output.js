/** Speakable text for a finished agent run — never raw JSON or ids read aloud. */
export function speakableOutput(output) {
  if (!output) return '';
  if (typeof output.message === 'string' && output.message.trim()) {
    // Markdown/list markers and database ids read badly; keep the prose.
    return output.message
      .replace(/[*_#`>]/g, '')
      .replace(/\b[0-9a-f]{24}\b/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  return '';
}
