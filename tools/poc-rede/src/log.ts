export interface LogEntry {
  at: string;
  msg: string;
}

const MAX_ENTRIES = 5000;
const entries: LogEntry[] = [];

export function log(msg: string): void {
  const now = new Date();
  entries.push({ at: now.toISOString(), msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
  console.log(`[${formatTime(now)}] ${msg}`);
}

export function logEntries(): LogEntry[] {
  return entries;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateTime(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(d)}`;
}

/** Compact timestamp for file names: 20260928-143005 */
export function fileStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return (e as NodeJS.ErrnoException).code ? `${(e as NodeJS.ErrnoException).code}: ${e.message}` : e.message;
  return String(e);
}
