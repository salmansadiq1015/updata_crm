import { execSync } from 'node:child_process';

/**
 * The version, read from git right now — development only.
 *
 * The badge normally shows what was baked in when the bundle was built, which
 * is exactly right on a server: a deployment is a build. On a developer's
 * machine it goes stale the moment they commit, because the dev server read
 * the config once at startup and nothing since has touched it.
 *
 * So in development the badge asks this instead, and the answer is whatever
 * git says at that moment. In production the route is not there: the built
 * values are the truth, and a route that shells out to git on a public server
 * is not something to leave lying around for a line of grey text.
 *
 * Route Handlers are not cached by default, so nothing here needs to say so.
 */
function read(command, fallback = '') {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

export function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }

  return Response.json({
    commit: read('git rev-parse --short=7 HEAD', 'unknown'),
    branch: read('git rev-parse --abbrev-ref HEAD'),
    committedAt: read('git log -1 --format=%cI'),
    dirty: Boolean(read('git status --porcelain')),
    // Not a build in dev — the moment the question was asked.
    builtAt: new Date().toISOString(),
  });
}
