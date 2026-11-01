import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

// runs/ is a read-only fixture: tests read it, never write into it.
describe('readNight', () => {
  it('reads runs/2026-10-28.jsonl into 5 jobs with 1 bad line', () => {
    const rows = readNight('runs', '2026-10-28');

    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(rows.every((r) => r.badLines === 1)).toBe(true);

    expect(rows.find((r) => r.job === 'lane/sync')).toMatchObject({
      owner: 'rook',
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(rows.find((r) => r.job === 'fixtures/refresh')).toMatchObject({
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-10-29T04:00:01+01:00',
      lastAt: '2026-10-29T04:00:01+01:00',
    });
    expect(rows.find((r) => r.job === 'rig/rotate-logs')).toMatchObject({
      owner: 'lane-07',
      runs: 1,
      lastStatus: 'ok',
      lastError: null,
    });
    // owner null: the row is kept, not dropped
    expect(rows.find((r) => r.job === 'digest/render')).toMatchObject({
      owner: null,
      runs: 1,
      lastStatus: 'ok',
      lastError: null,
    });
  });

  describe('with a temp runs dir', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const writeNight = (night: string, lines: string[]) =>
      writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n') + '\n');

    it('counts lines that do not parse and still renders the night', () => {
      writeNight('2026-10-30', [
        '{"at":"2026-10-30T23:00:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
        'garbage, not json',
        '{"at":"2026-10-30T23:05:00+01:00","job":"a/job","status":"retry","owner":"rook","error":"boom"}',
        '{"at":"2026-10-30T23:06:00+01:00","job":"b/job","status":"fail","owner":null,"error":"nope"}',
        '{"at":"2026-10-30T23:07:00+01:00","job":"a/job","status":"ok","owner":"rook"}',
        '{"at":"2026-10-30T23:08:00+01:00","job":"c/job","status":"weird","owner":"rook"}',
        '42',
      ]);

      const rows = readNight(dir, '2026-10-30');

      expect(rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
      expect(rows.every((r) => r.badLines === 3)).toBe(true);
      expect(rows.find((r) => r.job === 'a/job')).toMatchObject({
        owner: 'rook',
        runs: 3,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-30T23:00:00+01:00',
        lastAt: '2026-10-30T23:07:00+01:00',
      });
      expect(rows.find((r) => r.job === 'b/job')).toMatchObject({
        owner: null,
        runs: 1,
        lastStatus: 'fail',
        lastError: 'nope',
      });
    });

    it('takes first and last by time, not by file order', () => {
      writeNight('2026-10-31', [
        '{"at":"2026-10-31T23:10:00+01:00","job":"x/job","status":"ok","owner":null}',
        '{"at":"2026-10-31T23:00:00+01:00","job":"x/job","status":"fail","owner":null,"error":"early"}',
        '{"at":"2026-10-31T23:05:00+01:00","job":"x/job","status":"retry","owner":null,"error":"mid"}',
      ]);

      expect(readNight(dir, '2026-10-31')).toEqual([
        {
          job: 'x/job',
          owner: null,
          runs: 3,
          retries: 1,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-31T23:00:00+01:00',
          lastAt: '2026-10-31T23:10:00+01:00',
          badLines: 0,
        },
      ]);
    });

    it('returns [] for an empty file', () => {
      writeNight('2026-11-01', []);
      expect(readNight(dir, '2026-11-01')).toEqual([]);
    });

    it('throws for a night with no file', () => {
      expect(() => readNight(dir, '2099-01-01')).toThrow();
    });
  });
});
