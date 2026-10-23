export function getShanghaiDateKey(date?: Date): string;
export function isCalendarDate(value: unknown): value is string;
export function getDateValidationError(value: unknown, today?: string): string | null;
export function getPartialDateValidationError(value: unknown, today?: string): string | null;
export function addCalendarMonths(dateKey: string, months: number): string;
export function getRecordedTimeMinutes(time: unknown): number | null;
export function getRecordedTimeValidationError(time: unknown): string | null;
export function compareTestsNewestFirst(
	left: { testedAt: string; time?: string | null; id?: string },
	right: { testedAt: string; time?: string | null; id?: string },
): number;
export function toShanghaiRecordedTime(dateKey: string, time: string, timeZone: string): { testedAt: string; time: string };
export function toRecordedAtIso(dateKey: string, time?: string | null): string;
export function getTestWindow(time?: string | null): '凌晨' | '日间' | '晚间' | '晚高峰' | null;
