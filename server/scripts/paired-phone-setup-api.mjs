#!/usr/bin/env node
/** Local setup API: the real authenticated CRM routes and configured database,
 * without database seeding, migrations or unrelated outbound background jobs.
 * Development only, bound to loopback. --campaign-calls enables only the
 * calling worker for NEW explicit CRM starts, without unrelated jobs or scans.
 */
import http from 'node:http';
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { getRedisClient, disconnectRedis } from '../src/config/redis.js';
import cacheManager from '../src/shared/cache/CacheManager.js';
import logger from '../src/shared/logger/index.js';
import { initializeSocketServer } from '../src/shared/socket/socketServer.js';
import queueManager from '../src/shared/queue/QueueManager.js';
import { manualCampaignProcessor } from './lib/manual-campaign-processor.mjs';

if (!config.isDevelopment) throw new Error('The paired-phone setup API is for NODE_ENV=development only');
// Pairing must not implicitly create indexes across the configured shared DB.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
await connectDatabase(logger);
const redis = getRedisClient(logger);
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Configured Redis is unavailable')); }, 8000);
  const cleanup = () => { clearTimeout(timer); redis.off('ready', ready); redis.off('error', failed); };
  const ready = () => { cleanup(); resolve(); };
  const failed = (err) => { cleanup(); reject(err); };
  if (redis.status === 'ready') ready();
  else { redis.once('ready', ready); redis.once('error', failed); }
});
cacheManager.initL2(redis);
const campaignCalls = process.argv.includes('--campaign-calls');
if (campaignCalls) {
  const startedAt = process.env.UPDATA_CAMPAIGN_STARTED_AFTER ? Date.parse(process.env.UPDATA_CAMPAIGN_STARTED_AFTER) : Date.now();
  if (!Number.isFinite(startedAt) || startedAt > Date.now()) throw new Error('UPDATA_CAMPAIGN_STARTED_AFTER must be a valid past ISO date');
  const { OutboundCallingWorker } = await import('../src/jobs/outboundCalling.job.js');
  const worker = new OutboundCallingWorker();
  queueManager.registerQueue('outbound-calling', manualCampaignProcessor(worker.getHandler(), startedAt), {
    concurrency: 1, jobOptions: { attempts: 1, removeOnComplete: { age: 86400, count: 5000 } },
  });
  await queueManager.workers.get('outbound-calling').waitUntilReady();
}
const { createApp } = await import('../src/app.js');
const server = http.createServer(createApp());
const io = initializeSocketServer(server);
server.listen(config.server.port, '127.0.0.1', () => {
  console.log(`Paired-phone setup API: http://localhost:${config.server.port}/api/v1 (existing authentication; ${campaignCalls ? 'new manual campaign starts enabled' : 'setup only'}; no unrelated jobs or seeding)`);
});
server.on('error', (err) => { console.error(err.code || err.name); process.exit(1); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  io.close();
  await new Promise((resolve) => server.close(resolve));
  if (campaignCalls) await queueManager.shutdown();
  await disconnectRedis(logger);
  await disconnectDatabase(logger);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
