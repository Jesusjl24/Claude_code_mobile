// Generates the made-up export zips in web/fixtures/.
//
// Everything here is invented. Account names are obviously fake
// ("example_coding_account_01"). The file layouts copy what the Instagram and
// Google Takeout exports are *believed* to look like; they are unverified
// until a real export has gone through the adapters.
//
//   node scripts/make-fixtures.mjs          write the small fixtures
//   node scripts/make-fixtures.mjs --all    also write the large (200k+ event) ones
//
// Output is deterministic: a seeded random generator and fixed dates.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BlobReader, BlobWriter, ZipWriter, configure } from '@zip.js/zip.js';

configure({ useWebWorkers: false });

export const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const DECOY_MARKER = 'DECOY_MUST_NOT_BE_READ';

const DAY = 86_400_000;
export const FIRST_SCAN_END = Date.UTC(2026, 10, 10, 12, 0, 0); // 10 Nov 2026
export const SECOND_SCAN_END = FIRST_SCAN_END + 10 * DAY;
const ZIP_DATE = new Date(Date.UTC(2026, 10, 10));

const TOPICS = ['coding', 'study', 'memes', 'gaming', 'cooking', 'fitness', 'news', 'music'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function instagramHandle(i) {
  return `example_${TOPICS[i % TOPICS.length]}_account_${pad(i + 1, 2)}`;
}

export function youtubeChannel(i) {
  // One awkward name to exercise the streaming JSON reader and the CSV reader.
  if (i === 6) return 'Example "Quoted" Channel [07] {x}, \\ é 日本';
  const t = TOPICS[i % TOPICS.length];
  return `Example ${t[0].toUpperCase()}${t.slice(1)} Channel ${pad(i + 1, 2)}`;
}

/** Picks account indexes with a long-tailed (Zipf-like) weighting. */
function makePicker(count, rand) {
  const cum = new Float64Array(count);
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += 1 / (i + 1);
    cum[i] = total;
  }
  return () => {
    const x = rand() * total;
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] >= x) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
}

/** Event times, newest first, spread evenly at random over `days` ending at `end`. */
function makeTimes(events, days, end, rand) {
  const times = new Array(events);
  for (let i = 0; i < events; i++) times[i] = end - Math.floor(rand() * days * DAY);
  if (events > 0) times[0] = end;
  times.sort((a, b) => b - a);
  return times;
}

// ---------- YouTube (Google Takeout) ----------

const YT_ROOT = 'Takeout/YouTube and YouTube Music';

function youtubeHistoryParts({ events, days, channels, end, seed, unattributedRate = 0.05 }) {
  const rand = rng(seed);
  const pick = makePicker(channels, rand);
  const times = makeTimes(events, days, end, rand);
  const parts = ['['];
  for (let i = 0; i < events; i++) {
    const time = new Date(times[i]).toISOString();
    let entry;
    if (rand() < unattributedRate) {
      entry =
        rand() < 0.5
          ? { header: 'YouTube', title: 'Watched a video that has been removed', time, products: ['YouTube'], activityControls: ['YouTube watch history'] }
          : { header: 'YouTube', title: `Watched Example advert ${pad(i, 6)}`, titleUrl: `https://www.youtube.com/watch?v=EXAMPLE${pad(i, 6)}`, time, products: ['YouTube'], details: [{ name: 'From Google Ads' }], activityControls: ['YouTube watch history'] };
    } else {
      const c = pick();
      entry = {
        header: 'YouTube',
        title: `Watched Example video ${pad(i, 6)}`,
        titleUrl: `https://www.youtube.com/watch?v=EXAMPLE${pad(i, 6)}`,
        subtitles: [{ name: youtubeChannel(c), url: `https://www.youtube.com/channel/UCEXAMPLE${pad(c, 14)}` }],
        time,
        products: ['YouTube'],
        activityControls: ['YouTube watch history'],
      };
    }
    parts.push((i ? ',' : '') + JSON.stringify(entry));
  }
  parts.push(']');
  return parts;
}

function csvCell(s) {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function youtubeSubscriptionsCsv(indexes, extraNames = []) {
  const rows = ['Channel Id,Channel Url,Channel Title'];
  for (const c of indexes) {
    const id = `UCEXAMPLE${pad(c, 14)}`;
    rows.push(`${id},http://www.youtube.com/channel/${id},${csvCell(youtubeChannel(c))}`);
  }
  extraNames.forEach((name, i) => {
    const id = `UCEXAMPLEMENTOR${pad(i, 8)}`;
    rows.push(`${id},http://www.youtube.com/channel/${id},${csvCell(name)}`);
  });
  return rows.join('\n') + '\n';
}

function youtubeDecoys() {
  return {
    'Takeout/archive_browser.html': `<html><body>${DECOY_MARKER} archive browser</body></html>`,
    [`${YT_ROOT}/history/search-history.json`]: JSON.stringify([{ header: 'YouTube', title: `Searched for ${DECOY_MARKER}`, time: '2026-11-01T00:00:00.000Z' }]),
    [`${YT_ROOT}/comments/comments.csv`]: `Comment ID,Comment Text\n1,${DECOY_MARKER}\n`,
    [`${YT_ROOT}/playlists/Watch later-videos.csv`]: `Video ID,Playlist Video Creation Timestamp\n${DECOY_MARKER},2026-11-01\n`,
  };
}

const range = (n, from = 0) => Array.from({ length: n }, (_, i) => i + from);

function youtubeFixtures(all) {
  const out = {
    'youtube-normal.zip': {
      [`${YT_ROOT}/history/watch-history.json`]: youtubeHistoryParts({ events: 1500, days: 60, channels: 40, end: FIRST_SCAN_END, seed: 101 }),
      [`${YT_ROOT}/subscriptions/subscriptions.csv`]: youtubeSubscriptionsCsv(range(25)),
      ...youtubeDecoys(),
    },
    // The same made-up tester ten days later: unsubscribed from three channels
    // (two of them meme channels) and subscribed to two new ones.
    'youtube-normal-second.zip': {
      [`${YT_ROOT}/history/watch-history.json`]: youtubeHistoryParts({ events: 1500, days: 60, channels: 40, end: SECOND_SCAN_END, seed: 102 }),
      [`${YT_ROOT}/subscriptions/subscriptions.csv`]: youtubeSubscriptionsCsv(
        range(25).filter((i) => ![2, 10, 3].includes(i)),
        ['Example Mentor Channel 01', 'Example Mentor Channel 02'],
      ),
      ...youtubeDecoys(),
    },
    'youtube-empty.zip': {
      [`${YT_ROOT}/history/watch-history.json`]: '[]',
      [`${YT_ROOT}/subscriptions/subscriptions.csv`]: 'Channel Id,Channel Url,Channel Title\n',
    },
    'youtube-html.zip': {
      [`${YT_ROOT}/history/watch-history.html`]: '<html><body><div>Watched Example video 000001</div></body></html>',
      [`${YT_ROOT}/history/search-history.html`]: `<html><body>${DECOY_MARKER}</body></html>`,
      [`${YT_ROOT}/subscriptions/subscriptions.csv`]: youtubeSubscriptionsCsv(range(5)),
    },
    'youtube-unexpected.zip': {
      'Takeout/Example Video Service/verlauf/watched_videos.json': youtubeHistoryParts({ events: 20, days: 10, channels: 5, end: FIRST_SCAN_END, seed: 103 }),
      'Takeout/Example Video Service/abos/abos.csv': youtubeSubscriptionsCsv(range(5)),
      'Takeout/archive_browser.html': '<html><body>archive browser</body></html>',
    },
  };
  if (all) {
    out['youtube-large.zip'] = {
      [`${YT_ROOT}/history/watch-history.json`]: youtubeHistoryParts({ events: 210_000, days: 400, channels: 3000, end: FIRST_SCAN_END, seed: 104 }),
      [`${YT_ROOT}/subscriptions/subscriptions.csv`]: youtubeSubscriptionsCsv(range(400)),
      ...youtubeDecoys(),
    };
  }
  return out;
}

// ---------- Instagram ----------

const IG_VIEWS = 'ads_information/ads_and_topics';
const IG_FOLLOW = 'connections/followers_and_following';

function instagramViewParts({ key, events, days, accounts, end, seed, unattributedRate = 0.03 }) {
  const rand = rng(seed);
  const pick = makePicker(accounts, rand);
  const times = makeTimes(events, days, end, rand);
  const parts = [`{"${key}":[`];
  for (let i = 0; i < events; i++) {
    const map = {};
    if (rand() >= unattributedRate) map.Author = { href: '', value: instagramHandle(pick()), timestamp: 0 };
    map.Time = { href: '', value: '', timestamp: Math.floor(times[i] / 1000) };
    parts.push((i ? ',' : '') + JSON.stringify({ title: '', media_map_data: {}, string_map_data: map }));
  }
  parts.push(']}');
  return parts;
}

function instagramFollowing(indexes, extraHandles = []) {
  const handles = [...indexes.map(instagramHandle), ...extraHandles];
  return JSON.stringify({
    relationships_following: handles.map((h, i) =>
      // Two shapes are believed to exist: the handle in string_list_data[0].value
      // (older exports) or in title (newer exports). Fixtures carry both.
      i % 4 === 3
        ? { title: h, string_list_data: [{ href: `https://www.instagram.com/_u/${h}`, timestamp: 1_700_000_000 + i }] }
        : { title: '', media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/${h}`, value: h, timestamp: 1_700_000_000 + i }] },
    ),
  });
}

function instagramDecoys() {
  return {
    'your_instagram_activity/messages/inbox/example_chat_01/message_1.json': JSON.stringify({ messages: [{ sender_name: 'example_friend_01', content: DECOY_MARKER }] }),
    'logged_information/recent_searches/word_or_phrase_searches.json': JSON.stringify({ searches_keyword: [{ string_map_data: { Search: { value: DECOY_MARKER } } }] }),
    'connections/contacts/synced_contacts.json': JSON.stringify({ contacts_contact_info: [{ string_map_data: { 'First name': { value: DECOY_MARKER } } }] }),
    [`${IG_FOLLOW}/followers_1.json`]: JSON.stringify([{ title: '', string_list_data: [{ value: `${DECOY_MARKER}_follower` }] }]),
    [`${IG_FOLLOW}/following_hashtags.json`]: JSON.stringify({ relationships_following_hashtags: [{ title: DECOY_MARKER }] }),
    'media/posts/202611/example_photo.jpg': DECOY_MARKER,
  };
}

function instagramFixtures(all) {
  const out = {
    'instagram-normal.zip': {
      [`${IG_VIEWS}/posts_viewed.json`]: instagramViewParts({ key: 'impressions_history_posts_seen', events: 1100, days: 60, accounts: 60, end: FIRST_SCAN_END, seed: 201 }),
      [`${IG_VIEWS}/videos_watched.json`]: instagramViewParts({ key: 'impressions_history_videos_watched', events: 500, days: 60, accounts: 60, end: FIRST_SCAN_END - 3_600_000, seed: 202 }),
      [`${IG_FOLLOW}/following.json`]: instagramFollowing(range(30)),
      ...instagramDecoys(),
    },
    'instagram-normal-second.zip': {
      [`${IG_VIEWS}/posts_viewed.json`]: instagramViewParts({ key: 'impressions_history_posts_seen', events: 1100, days: 60, accounts: 60, end: SECOND_SCAN_END, seed: 203 }),
      [`${IG_VIEWS}/videos_watched.json`]: instagramViewParts({ key: 'impressions_history_videos_watched', events: 500, days: 60, accounts: 60, end: SECOND_SCAN_END - 3_600_000, seed: 204 }),
      [`${IG_FOLLOW}/following.json`]: instagramFollowing(
        range(30).filter((i) => ![2, 10, 3].includes(i)),
        ['example_mentor_01', 'example_mentor_02'],
      ),
      ...instagramDecoys(),
    },
    'instagram-empty.zip': {
      [`${IG_VIEWS}/posts_viewed.json`]: '{"impressions_history_posts_seen":[]}',
      [`${IG_VIEWS}/videos_watched.json`]: '{"impressions_history_videos_watched":[]}',
      [`${IG_FOLLOW}/following.json`]: '{"relationships_following":[]}',
    },
    'instagram-html.zip': {
      [`${IG_VIEWS}/posts_viewed.html`]: '<html><body><div>example_coding_account_01</div></body></html>',
      [`${IG_VIEWS}/videos_watched.html`]: '<html><body><div>example_coding_account_01</div></body></html>',
      [`${IG_FOLLOW}/following.html`]: '<html><body><a>example_coding_account_01</a></body></html>',
      'start_here.html': '<html><body>start here</body></html>',
    },
    'instagram-unexpected.zip': {
      'activity/seen_things.json': instagramViewParts({ key: 'seen', events: 20, days: 10, accounts: 5, end: FIRST_SCAN_END, seed: 205 }),
      'people/people_i_follow.json': instagramFollowing(range(5)),
      'readme.txt': 'An archive that is not laid out like an Instagram export.',
    },
  };
  if (all) {
    out['instagram-large.zip'] = {
      [`${IG_VIEWS}/posts_viewed.json`]: instagramViewParts({ key: 'impressions_history_posts_seen', events: 140_000, days: 400, accounts: 3000, end: FIRST_SCAN_END, seed: 206 }),
      [`${IG_VIEWS}/videos_watched.json`]: instagramViewParts({ key: 'impressions_history_videos_watched', events: 70_000, days: 400, accounts: 3000, end: FIRST_SCAN_END - 3_600_000, seed: 207 }),
      [`${IG_FOLLOW}/following.json`]: instagramFollowing(range(600)),
      ...instagramDecoys(),
    };
  }
  return out;
}

// ---------- writing ----------

async function writeZip(path, files) {
  const writer = new ZipWriter(new BlobWriter('application/zip'));
  for (const [name, content] of Object.entries(files)) {
    const blob = new Blob(Array.isArray(content) ? content : [content]);
    await writer.add(name, new BlobReader(blob), { lastModDate: ZIP_DATE, level: 6 });
  }
  const blob = await writer.close();
  writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
}

/**
 * Writes fixture zips. `all` includes the large ones; `onlyMissing` skips
 * files that already exist (used by the test setup).
 */
export async function makeFixtures({ all = false, onlyMissing = false, log = () => {} } = {}) {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const need = (name) => !(onlyMissing && existsSync(join(FIXTURE_DIR, name)));
  const smallNames = [
    'youtube-normal.zip', 'youtube-normal-second.zip', 'youtube-empty.zip', 'youtube-html.zip', 'youtube-unexpected.zip',
    'instagram-normal.zip', 'instagram-normal-second.zip', 'instagram-empty.zip', 'instagram-html.zip', 'instagram-unexpected.zip',
  ];
  const largeNames = all ? ['youtube-large.zip', 'instagram-large.zip'] : [];
  const wanted = [...smallNames, ...largeNames].filter(need);
  if (wanted.length === 0) return [];
  const wantLarge = wanted.some((n) => n.includes('-large'));
  // Generating is cheap for the small ones, so build each app's set once.
  const sets = { ...youtubeFixtures(wantLarge), ...instagramFixtures(wantLarge) };
  for (const name of wanted) {
    await writeZip(join(FIXTURE_DIR, name), sets[name]);
    log(`wrote fixtures/${name}`);
  }
  return wanted;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await makeFixtures({ all: process.argv.includes('--all'), log: console.log });
}
