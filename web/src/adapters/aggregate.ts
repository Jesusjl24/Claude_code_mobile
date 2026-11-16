// Shared by both adapters: collects (time, account) pairs compactly, then keeps
// the most recent 30 days and counts views per account.
import type { AccountViews } from '../lib/summary';

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface Aggregate {
  rangeStart: string;
  rangeEnd: string;
  totalViewEvents: number;
  unattributedEvents: number;
  accounts: AccountViews[];
  eventsBeforeRange: number;
}

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class ViewAggregator {
  private times = new Float64Array(4096);
  private ids = new Int32Array(4096);
  private count = 0;
  private names: string[] = [];
  private idByName = new Map<string, number>();

  get size() {
    return this.count;
  }

  /** `account` is null for a view event with no account or channel named. */
  add(timeMs: number, account: string | null): void {
    if (this.count === this.times.length) {
      const times = new Float64Array(this.count * 2);
      times.set(this.times);
      this.times = times;
      const ids = new Int32Array(this.count * 2);
      ids.set(this.ids);
      this.ids = ids;
    }
    let id = -1;
    if (account !== null) {
      const known = this.idByName.get(account);
      if (known === undefined) {
        id = this.names.length;
        this.names.push(account);
        this.idByName.set(account, id);
      } else id = known;
    }
    this.times[this.count] = timeMs;
    this.ids[this.count] = id;
    this.count++;
  }

  /** Returns null when no view events were added. */
  finish(): Aggregate | null {
    if (this.count === 0) return null;
    let latest = -Infinity;
    for (let i = 0; i < this.count; i++) if (this.times[i]! > latest) latest = this.times[i]!;
    // The most recent 30 days, counted back from the newest view event.
    const cutoff = latest - WINDOW_DAYS * DAY_MS;
    const views = new Int32Array(this.names.length);
    let earliest = Infinity;
    let total = 0;
    let unattributed = 0;
    for (let i = 0; i < this.count; i++) {
      const t = this.times[i]!;
      if (t <= cutoff) continue;
      total++;
      if (t < earliest) earliest = t;
      const id = this.ids[i]!;
      if (id < 0) unattributed++;
      else views[id]!++;
    }
    const accounts: AccountViews[] = [];
    for (let id = 0; id < views.length; id++) if (views[id]! > 0) accounts.push({ name: this.names[id]!, views: views[id]! });
    accounts.sort((a, b) => b.views - a.views || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return {
      rangeStart: utcDay(earliest),
      rangeEnd: utcDay(latest),
      totalViewEvents: total,
      unattributedEvents: unattributed,
      accounts,
      eventsBeforeRange: this.count - total,
    };
  }
}

/** More than this share of unreadable records means the format is not what we expect: fail loudly. */
export const MAX_SKIPPED_SHARE = 0.05;

export function tooManySkipped(skipped: number, read: number): boolean {
  const all = skipped + read;
  return all > 0 && (read === 0 || skipped / all > MAX_SKIPPED_SHARE);
}

/** Removes duplicates, keeping first-seen order. */
export function unique(list: string[]): string[] {
  return [...new Set(list)];
}
