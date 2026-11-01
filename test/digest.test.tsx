import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

// plan.md §2d: route tests for §2a and §2b. runs/ is a read-only fixture, so
// these nights are written into a temp runs dir the app is pointed at.
const NIGHT = '2026-10-30';
const EMPTY_NIGHT = '2026-10-31';
const BAD_LINE_NIGHT = '2026-11-01';
const MISSING_NIGHT = '2099-12-31';

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  const writeNight = (night: string, lines: string[]) =>
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n') + '\n');

  writeNight(NIGHT, [
    '{"at":"2026-10-30T01:00:00+01:00","job":"alpha/sync","status":"ok","owner":"rook"}',
    '{"at":"2026-10-30T02:00:00+01:00","job":"beta/backup","status":"retry","owner":"lane-07","error":"disk full"}',
    '{"at":"2026-10-30T03:00:00+01:00","job":"alpha/sync","status":"fail","owner":"rook","error":"boom"}',
  ]);
  writeNight(EMPTY_NIGHT, []);
  writeNight(BAD_LINE_NIGHT, [
    '{"at":"2026-11-01T01:00:00+01:00","job":"gamma/ingest","status":"ok","owner":null}',
    'this line does not parse',
  ]);
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

// First cell of each body row: <tr ...><td>job</td>. The header row uses <th>.
const pageJobs = (html: string) => [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);

describe('GET /digest/:night and GET /api/digest/:night', () => {
  it("answers 200 with the night's rows on both routes", async () => {
    const app = createApp(config());

    const page = await app.request(`/digest/${NIGHT}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('<table>');
    expect(html).toContain('<td>alpha/sync</td>');
    expect(html).toContain('<td>beta/backup</td>');

    const api = await app.request(`/api/digest/${NIGHT}`);
    expect(api.status).toBe(200);
    expect(api.headers.get('content-type')).toContain('application/json');
    const rows = (await api.json()) as DigestRow[];
    expect(rows.map((r) => r.job)).toEqual(['alpha/sync', 'beta/backup']);
    expect(rows.find((r) => r.job === 'alpha/sync')).toMatchObject({
      owner: 'rook',
      runs: 2,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'boom',
      badLines: 0,
    });
    expect(rows.find((r) => r.job === 'beta/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 1,
      lastStatus: 'retry',
      lastError: 'disk full',
      badLines: 0,
    });
  });

  it('returns the same jobs in the same order on the page and as JSON (ADR 0001)', async () => {
    const app = createApp(config());
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const rows = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as DigestRow[];
    expect(pageJobs(html)).toEqual(rows.map((r) => r.job));
  });

  it('answers 404 for a night with no file, on both routes', async () => {
    const app = createApp(config());

    const page = await app.request(`/digest/${MISSING_NIGHT}`);
    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no run log for this night');

    const api = await app.request(`/api/digest/${MISSING_NIGHT}`);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'no run log for this night', night: MISSING_NIGHT });
  });

  it('renders "nothing ran" and [] for an empty night', async () => {
    const app = createApp(config());

    const page = await app.request(`/digest/${EMPTY_NIGHT}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('nothing ran');
    expect(pageJobs(html)).toEqual([]);

    const api = await app.request(`/api/digest/${EMPTY_NIGHT}`);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual([]);
  });

  it('counts a bad line and still renders the night, on both routes', async () => {
    const app = createApp(config());

    const page = await app.request(`/digest/${BAD_LINE_NIGHT}`);
    expect(page.status).toBe(200);
    expect(pageJobs(await page.text())).toEqual(['gamma/ingest']);

    const api = await app.request(`/api/digest/${BAD_LINE_NIGHT}`);
    expect(api.status).toBe(200);
    const rows = (await api.json()) as DigestRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      job: 'gamma/ingest',
      owner: null,
      runs: 1,
      lastStatus: 'ok',
      badLines: 1,
    });
  });
});
