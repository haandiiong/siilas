export type TestRegion = '新加坡' | '香港' | '日本' | '美国';
export type ExitRegionRecord = { exitRegion?: string | null };
export const TEST_REGIONS: readonly TestRegion[];
export function getTestRegion(test: ExitRegionRecord): string | null;
export function getCoreTestRegion(test: ExitRegionRecord): TestRegion | null;
export function getTestRegions(tests: readonly ExitRegionRecord[]): string[];
