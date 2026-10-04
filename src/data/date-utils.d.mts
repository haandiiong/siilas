export function getShanghaiDateKey(date?: Date): string;
export function isCalendarDate(value: unknown): value is string;
export function getDateValidationError(value: unknown, today?: string): string | null;
export function getPartialDateValidationError(value: unknown, today?: string): string | null;
export function addCalendarMonths(dateKey: string, months: number): string;
export function toRecordedAtIso(dateKey: string, time?: string | null): string;
