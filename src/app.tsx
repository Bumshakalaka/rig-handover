import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { readNight } from './digest/reader.js';
import { DigestTable } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    try {
      return c.json(readNight(config.runsDir, night));
    } catch {
      return c.json({ error: 'no run log for this night', night }, 404);
    }
  });

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    try {
      const rows = readNight(config.runsDir, night);
      return c.html(
        <Layout title={`digest ${night}`} lane={lane()}>
          <DigestTable night={night} rows={rows} />
        </Layout>,
      );
    } catch {
      // readNight throws only when the night's file is missing (reader.ts)
      return c.html(
        <Layout title={`digest ${night}`} lane={lane()}>
          <h1>digest · {night}</h1>
          <p class="mute">no run log for this night</p>
        </Layout>,
        404,
      );
    }
  });

  return app;
}
