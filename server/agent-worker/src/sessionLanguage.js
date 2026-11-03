/** Serialize instruction changes and discard stale CRM language acknowledgements. */
export function createLanguageUpdater({ revision = 0, update }) {
  let latestRevision = revision;
  let pending = Promise.resolve();
  return result => {
    pending = pending.catch(() => {}).then(async () => {
      if (!Number.isInteger(result.revision) || result.revision < latestRevision) return;
      latestRevision = result.revision;
      await update(result.language);
    });
    return pending;
  };
}
