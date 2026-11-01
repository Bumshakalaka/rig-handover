// Morning digest, plan.md §1: one row per job for one night, read from
// runs/<night>.jsonl (one JSON object per line: at, job, status, owner, optional error).
// A line that doesn't parse is counted in badLines, never thrown — the night still
// renders. owner may be null; the row is kept and the page shows —.

export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
  badLines: number;
};

// Signature only; the reader itself lands with issue #2 (src/digest/reader.ts).
export declare function readNight(runsDir: string, night: string): DigestRow[];
