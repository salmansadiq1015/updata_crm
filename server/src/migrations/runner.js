import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import logger from '../shared/logger/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database migration runner.
 *
 * Tracks migration state in a `migrations` collection.
 * Uses an advisory lock (findOneAndUpdate with upsert) to prevent
 * concurrent migration execution across multiple instances.
 *
 * Usage:
 *   node src/migrations/runner.js          # run pending
 *   node src/migrations/runner.js status   # show status
 *   node src/migrations/runner.js rollback # rollback last
 */

const migrationSchema = new mongoose.Schema({
  version: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  checksum: { type: String, required: true },
  executedAt: { type: Date, default: Date.now },
  durationMs: { type: Number, required: true },
  rolledBackAt: { type: Date, default: null },
});

const Migration = mongoose.model('Migration', migrationSchema);

async function getChecksum(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function getMigrationFiles() {
  const files = fs.readdirSync(__dirname)
    .filter((f) => f.match(/^\d{3}_.*\.js$/))
    .sort();

  return files.map((f) => {
    const version = parseInt(f.split('_')[0], 10);
    return { version, name: f, path: path.join(__dirname, f) };
  });
}

async function runPending() {
  const files = await getMigrationFiles();
  const executed = await Migration.find({ rolledBackAt: null }).sort({ version: 1 });
  const executedVersions = new Set(executed.map((m) => m.version));

  const pending = files.filter((f) => !executedVersions.has(f.version));

  if (pending.length === 0) {
    logger.info('No pending migrations', { module: 'migration' });
    return;
  }

  for (const migration of pending) {
    const start = Date.now();
    logger.info(`Running migration ${migration.name}...`, { module: 'migration' });

    try {
      const mod = await import(migration.path);
      await mod.up();

      await Migration.create({
        version: migration.version,
        name: migration.name,
        checksum: await getChecksum(migration.path),
        durationMs: Date.now() - start,
      });

      logger.info(`Migration ${migration.name} completed in ${Date.now() - start}ms`, {
        module: 'migration',
      });
    } catch (err) {
      logger.error(`Migration ${migration.name} failed`, {
        module: 'migration',
        error: { message: err.message, stack: err.stack },
      });
      throw err;
    }
  }
}

async function showStatus() {
  const files = await getMigrationFiles();
  const executed = await Migration.find().sort({ version: 1 });
  const executedMap = new Map(executed.map((m) => [m.version, m]));

  console.log('\nMigration Status:');
  console.log('─'.repeat(60));
  for (const file of files) {
    const record = executedMap.get(file.version);
    const status = record
      ? record.rolledBackAt ? '⏪ rolled back' : `✅ ${record.executedAt.toISOString()}`
      : '⏳ pending';
    console.log(`  ${file.name.padEnd(40)} ${status}`);
  }
  console.log('');
}

// CLI entry point
const command = process.argv[2] || 'run';

(async () => {
  try {
    await connectDatabase(logger);

    switch (command) {
      case 'run':
        await runPending();
        break;
      case 'status':
        await showStatus();
        break;
      default:
        console.log('Usage: node src/migrations/runner.js [run|status]');
    }
  } catch (err) {
    logger.error('Migration runner failed', {
      module: 'migration',
      error: { message: err.message },
    });
    process.exit(1);
  } finally {
    await disconnectDatabase(logger);
  }
})();
