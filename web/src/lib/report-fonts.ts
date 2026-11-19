// The fonts embedded in report.html, as base64 data: URLs (Vite `?inline`).
// Kept apart from report.ts so unit tests can build reports without them.
import syne700 from '@fontsource/syne/files/syne-latin-700-normal.woff2?inline';
import syne800 from '@fontsource/syne/files/syne-latin-800-normal.woff2?inline';
import dmSans400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2?inline';
import dmSans700 from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2?inline';
import dmMono400 from '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?inline';
import type { ReportFonts } from './report';

export const REPORT_FONTS: ReportFonts = { syne700, syne800, dmSans400, dmSans700, dmMono400 };
