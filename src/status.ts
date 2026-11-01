import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lastBeat, type Beat } from './heartbeat.js';

// Board counts for one night: jobs by their last status at the end of the night,
// taken from the same readNight rows the digest page shows (plan.md §2c, ADR 0001).
export type NightCounts = {
  ok: number;
  retry: number;
  fail: number;
};

export type NightSummary = {
  night: string;
  counts: NightCounts | null; // null when the night's log can't be read
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

// A night whose log can't be read still lists on the board, just without counts.
function summarizeNight(runsDir: string, night: string): NightSummary {
  try {
    const rows = readNight(runsDir, night);
    return {
      night,
      counts: {
        ok: rows.filter((r) => r.lastStatus === 'ok').length,
        retry: rows.filter((r) => r.lastStatus === 'retry').length,
        fail: rows.filter((r) => r.lastStatus === 'fail').length,
      },
    };
  } catch {
    return { night, counts: null };
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => summarizeNight(config.runsDir, night)),
  };
}
