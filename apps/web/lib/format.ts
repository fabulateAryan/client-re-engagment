/** Display formatting. Australian English, DD/MM/YYYY, shown in Sydney time. */
const TIME_ZONE = 'Australia/Sydney';

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

export type PostAgeTone = 'fresh' | 'recent' | 'month' | 'older' | 'old';

/** How old a post is, as a label and a colour band. */
export function postAge(
  iso: string,
  now: number = Date.now(),
): { label: string; tone: PostAgeTone; days: number } {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
  if (days <= 2) return { label: 'New', tone: 'fresh', days };
  if (days <= 7) return { label: 'This week', tone: 'recent', days };
  if (days <= 31) return { label: 'This month', tone: 'month', days };
  if (days <= 92) return { label: '1 to 3 months old', tone: 'older', days };
  return { label: 'Over 3 months old', tone: 'old', days };
}

/** Time between two moments; with no end (still running), until now. */
export function durationBetween(startIso: string, endIso: string | null): string {
  const end = endIso === null ? Date.now() : new Date(endIso).getTime();
  const ms = end - new Date(startIso).getTime();
  if (ms < 1000) return `${Math.max(ms, 0)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString('en-AU')} ${count === 1 ? singular : pluralForm}`;
}

const compactFormat = new Intl.NumberFormat('en-AU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** 1234 -> "1.2K", 2500000 -> "2.5M". */
export function compactNumber(value: number): string {
  return compactFormat.format(value);
}

export function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 0);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => (w ?? '').charAt(0).toUpperCase()).join('');
}

/** 850 -> "850 ms", 4200 -> "4.2 s", 95000 -> "1m 35s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(Math.round(ms), 0)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/** Whole days since a date (0 for today or the future). */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}
