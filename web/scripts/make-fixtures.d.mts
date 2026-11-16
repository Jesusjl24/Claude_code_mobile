export const FIXTURE_DIR: string;
export const DECOY_MARKER: string;
export const FIRST_SCAN_END: number;
export const SECOND_SCAN_END: number;
export function instagramHandle(i: number): string;
export function youtubeChannel(i: number): string;
export function makeFixtures(opts?: { all?: boolean; onlyMissing?: boolean; log?: (m: string) => void }): Promise<string[]>;
