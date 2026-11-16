// Mentor rules from SPEC.md: the page refuses a mentor the tester already
// follows, and one on a different app from the scan.
import { APP_LABEL, type AppId, type Summary } from './summary';

export interface Mentor {
  app: AppId;
  /** Instagram or YouTube handle, without the leading @. */
  handle: string;
  /** Channel name as YouTube shows it. Needed for YouTube because the export lists subscriptions by channel name. Empty for Instagram. */
  name: string;
  /** One line: why this account serves the tester's goal. */
  reason: string;
}

export interface MentorInput {
  app: string;
  handle: string;
  name: string;
  reason: string;
}

export type MentorCheck = { ok: true; mentor: Mentor } | { ok: false; error: string };

export const MAX_MENTOR_REASON = 160;
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const YOUTUBE_HANDLE = /^[\p{L}\p{N}._-]{3,30}$/u;
const HOSTS: Record<AppId, RegExp> = { instagram: /(^|\.)instagram\.com$/i, youtube: /(^|\.)youtube\.com$/i };

/** For comparing names: trimmed, lower case, no leading @. */
export const normalizeName = (s: string) => s.trim().replace(/^@/, '').toLowerCase();

export function mentorUrl(m: Pick<Mentor, 'app' | 'handle'>): string {
  return m.app === 'instagram' ? `https://www.instagram.com/${encodeURIComponent(m.handle)}/` : `https://www.youtube.com/@${encodeURIComponent(m.handle)}`;
}

/** Turns what the builder typed (a handle, @handle, or a profile link) into a handle for `app`, or an error. */
function readHandle(raw: string, app: AppId): { handle: string } | { error: string } {
  const text = raw.trim();
  if (text === '') return { error: 'Enter the mentor’s handle.' };
  if (/^https?:\/\//i.test(text) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return { error: 'That link could not be read. Enter the handle instead.' };
    }
    if (!HOSTS[app].test(url.hostname)) {
      const other: AppId = app === 'instagram' ? 'youtube' : 'instagram';
      const whose = HOSTS[other].test(url.hostname) ? `a ${APP_LABEL[other]} link` : `a link to ${url.hostname}`;
      return { error: `That is ${whose}, but this tester scanned ${APP_LABEL[app]}. A mentor must be on the same app as the scan.` };
    }
    const first = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] ?? '');
    if (app === 'youtube') {
      if (!first.startsWith('@')) return { error: 'For YouTube, use the channel’s @handle (a link like youtube.com/@handle), not a /channel/ or video link.' };
      return readHandle(first, app);
    }
    return readHandle(first, app);
  }
  const handle = text.replace(/^@/, '');
  if (!(app === 'instagram' ? INSTAGRAM_HANDLE : YOUTUBE_HANDLE).test(handle)) {
    return { error: `"${text}" does not look like ${app === 'instagram' ? 'an Instagram' : 'a YouTube'} handle. Enter the handle only, such as @example_handle.` };
  }
  return { handle };
}

export function checkMentor(input: MentorInput, summary: Pick<Summary, 'app' | 'following'>, existing: readonly Mentor[]): MentorCheck {
  if (input.app !== summary.app) {
    const label = input.app === 'instagram' || input.app === 'youtube' ? APP_LABEL[input.app] : `"${input.app}"`;
    return { ok: false, error: `This mentor is on ${label}, but this tester scanned ${APP_LABEL[summary.app]}. A mentor must be on the same app as the scan.` };
  }
  const app = summary.app;
  const parsed = readHandle(input.handle, app);
  if ('error' in parsed) return { ok: false, error: parsed.error };
  const handle = parsed.handle;
  const name = app === 'youtube' ? input.name.trim() : '';
  if (app === 'youtube' && name === '') {
    return { ok: false, error: 'Enter the channel name as YouTube shows it. The export lists subscriptions by channel name, so it is needed to check the tester does not already subscribe.' };
  }
  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason === '') return { ok: false, error: 'Enter a one-line reason.' };
  if (reason.length > MAX_MENTOR_REASON) return { ok: false, error: `Keep the reason to one line of at most ${MAX_MENTOR_REASON} characters.` };

  const following = new Set(summary.following.map(normalizeName));
  if (following.has(normalizeName(handle)) || (name !== '' && following.has(normalizeName(name)))) {
    return { ok: false, error: `The tester already follows ${name || `@${handle}`}. A mentor must be someone they do not follow yet.` };
  }
  if (existing.some((m) => normalizeName(m.handle) === normalizeName(handle) || (name !== '' && normalizeName(m.name) === normalizeName(name)))) {
    return { ok: false, error: `${name || `@${handle}`} is already in the mentor list.` };
  }
  return { ok: true, mentor: { app, handle, name, reason } };
}

/** The name to match against a following list: channel name on YouTube, handle on Instagram. */
export const mentorFollowKeys = (m: Mentor) => [normalizeName(m.handle), ...(m.name ? [normalizeName(m.name)] : [])];
