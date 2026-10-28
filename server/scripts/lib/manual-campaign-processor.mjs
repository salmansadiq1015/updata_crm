/** Local setup server only: do not replay calls from a previous debugging run.
 * Production's normal worker continues to provide durable campaign recovery.
 */
export function manualCampaignProcessor(processJob, startedAt = Date.now()) {
  return async job => {
    if (!Number.isFinite(job.timestamp) || job.timestamp < startedAt) return { skipped: true, reason: 'start_campaign_again_in_crm' };
    return processJob(job);
  };
}
