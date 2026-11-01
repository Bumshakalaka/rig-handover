// Morning digest, plan.md §1: read runs/<night>.jsonl into one DigestRow per job.
// One JSON object per line (at, job, status: ok|retry|fail, owner, optional error).
// A line that doesn't parse into a run entry is counted in badLines, never thrown —
// the night still renders. owner may be null; the row is kept. badLines is the
// night's count, repeated on every row (DigestRow carries it per row).
// Throws only when the night's file is missing (the route turns that into 404);
// an empty file returns []. Times keep the offset from the log, never converted.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// Parse input at the edge, trust types after: anything that isn't a run entry
// (broken JSON, wrong shape, unknown status) is a bad line.
function parseRunLine(line: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string' || typeof v.job !== 'string') return null;
  if (typeof v.status !== 'string' || !STATUSES.includes(v.status)) return null;
  if (v.owner !== null && typeof v.owner !== 'string') return null;
  if (v.error !== undefined && typeof v.error !== 'string') return null;
  return {
    at: v.at,
    job: v.job,
    status: v.status as RunStatus,
    owner: v.owner as string | null,
    error: typeof v.error === 'string' ? v.error : undefined,
  };
}

type Acc = {
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export function readNight(runsDir: string, night: string): DigestRow[] {
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  const jobs = new Map<string, Acc>();
  let badLines = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue; // trailing newline, not a bad line
    const run = parseRunLine(line);
    if (!run) {
      badLines++;
      continue;
    }
    const acc = jobs.get(run.job);
    if (!acc) {
      jobs.set(run.job, {
        owner: run.owner, // first line of the job keeps the owner
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    acc.runs++;
    if (run.status === 'retry') acc.retries++;
    // first/last follow the timestamps; file order breaks ties and covers
    // times that don't parse as dates.
    const t = Date.parse(run.at);
    if (Number.isNaN(Date.parse(acc.lastAt)) || Number.isNaN(t) || t >= Date.parse(acc.lastAt)) {
      acc.lastAt = run.at;
      acc.lastStatus = run.status;
      acc.lastError = run.error ?? null;
    }
    if (!Number.isNaN(t) && (Number.isNaN(Date.parse(acc.firstAt)) || t < Date.parse(acc.firstAt))) {
      acc.firstAt = run.at;
    }
  }

  return [...jobs.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, acc]) => ({ job, ...acc, badLines }));
}
