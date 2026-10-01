#!/usr/bin/env bash
#
# Deploys what is on origin/main to this server.
#
# Written after a deployment left six migrations unapplied for weeks. The
# order below is the whole point: dependencies before migrations, migrations
# before the build, and the API restarted only once the database matches the
# code it is about to run. Doing it by hand is how a step gets skipped —
# and the step that got skipped was the one that switches the agents on.
#
#   sudo -u ubuntu /var/www/updata/deploy/deploy.sh
#
set -euo pipefail

ROOT="${DEPLOY_ROOT:-/var/www/updata}"
BRANCH="${DEPLOY_BRANCH:-main}"
STAMP="$(date +%Y%m%d-%H%M%S)"

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

cd "$ROOT"

say "État avant"
git log --oneline -1
BEFORE="$(git rev-parse HEAD)"

say "Récupération de origin/$BRANCH"
git fetch origin --quiet
# --ff-only: a deployment never merges. A server whose working tree has
# diverged is a problem to look at, not to paper over.
git pull --ff-only origin "$BRANCH"
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  say "Rien de nouveau — $BEFORE"
else
  say "Déployé : $BEFORE → $AFTER"
  git log --oneline "$BEFORE..$AFTER" | sed 's/^/  /'
fi

say "Sauvegarde de la base"
# Before the migrations, never after: a migration that goes wrong is exactly
# when the previous state is needed.
URI="$(grep -E '^MONGODB_URI=' "$ROOT/server/.env" | cut -d= -f2-)"
BACKUP="/home/ubuntu/backups/updata-$STAMP"
if command -v mongodump >/dev/null 2>&1; then
  mkdir -p "$BACKUP"
  mongodump --uri="$URI" --out="$BACKUP" --quiet
  echo "  $BACKUP ($(du -sh "$BACKUP" | cut -f1))"
  # Keep a fortnight; a dump nobody looked at in two weeks is not the one
  # anybody will restore.
  find /home/ubuntu/backups -maxdepth 1 -name 'updata-*' -mtime +14 -exec rm -rf {} + 2>/dev/null || true
else
  echo "  mongodump absent — AUCUNE sauvegarde prise"
fi

say "Dépendances serveur"
cd "$ROOT/server"
npm ci --omit=dev

say "Migrations"
# The step that was missing. It is idempotent and holds a lock, so running it
# on every deployment costs a second and never runs one twice.
node src/migrations/runner.js

say "Dépendances et build client"
cd "$ROOT/client"
npm ci
npm run build

say "Redémarrage"
pm2 restart updata-api --update-env
pm2 restart updata-client --update-env
sleep 5

say "Vérification"
pm2 list | grep -E 'updata-(api|client)' || true
cd "$ROOT/server"
node -e "
require('dotenv').config();
const m = require('mongoose');
m.connect(process.env.MONGODB_URI).then(async () => {
  const db = m.connection.db;
  const applied = await db.collection('migrations').countDocuments();
  const on = await db.collection('agentregistries').countDocuments({ isEnabled: true });
  const all = await db.collection('agentregistries').countDocuments();
  console.log(\`  migrations appliquées : \${applied}\`);
  console.log(\`  agents allumés        : \${on} / \${all}\`);
  await m.disconnect();
}).catch((e) => { console.log('  vérification impossible :', e.message); process.exit(0); });
" 2>/dev/null | grep -v dotenv

say "Terminé — $(git -C "$ROOT" log --oneline -1)"
