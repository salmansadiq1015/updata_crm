/**
 * Loads the environment, in one place, in one order.
 *
 * Two files, and the second wins:
 *
 *   .env         what this deployment is — the shared configuration and the
 *                secrets that go with it.
 *   .env.local   what THIS machine is — the database it talks to, the object
 *                store, the front-end it links to. Never committed, never
 *                deployed, and never overwritten by a paste from somewhere
 *                else.
 *
 * The split exists because of what happened on 26.08.2026: a production
 * connection string was pasted into `.env` on a developer machine, and the API
 * spent the afternoon crash-looping against a database that does not exist
 * here. Nothing in `.env` could have prevented it, because `.env` is the file
 * people paste into. `.env.local` is the one that survives.
 *
 * Import this before anything reads `process.env` — a real environment
 * variable still beats both files, so a container or a CI runner is unaffected.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(serverRoot, '.env') });
// override: what this machine says about itself outranks the shared file.
dotenv.config({ path: path.join(serverRoot, '.env.local'), override: true });

export default serverRoot;
