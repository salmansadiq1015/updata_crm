// One long-lived HTTP server per Express app for supertest. `request(app)` listens on a fresh
// ephemeral port for every request; under a parallel test run a just-freed port can be taken by
// another process, which shows up as random 404s, hangs or "Parse Error: Expected HTTP/".
import { afterAll } from '@jest/globals';

const servers = new Map();

export function serve(app) {
  let server = servers.get(app);
  if (!server) {
    server = app.listen(0);
    servers.set(app, server);
  }
  return server;
}

afterAll(async () => {
  await Promise.all([...servers.values()].map((server) => new Promise((resolve) => server.close(resolve))));
  servers.clear();
});
