const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

const daysInMonth = (year, month) => {
	if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

/** @param {Date} [date] @returns {string} */
export const getShanghaiDateKey = (date = new Date()) => {
	const parts = shanghaiDateFormatter.formatToParts(date);
	const value = (type) => parts.find((part) => part.type === type)?.value;
	return `${value('year')}-${value('month')}-${value('day')}`;
};

/** @param {unknown} value @returns {boolean} */
export const isCalendarDate = (value) => {
	if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

/** @param {unknown} value @param {string} [today] @returns {string | null} */
export const getDateValidationError = (value, today = getShanghaiDateKey()) => {
	if (!isCalendarDate(value)) return '必须是有效的 YYYY-MM-DD 日历日期';
	if (value > today) return `不得晚于中国标准时间当前日期 ${today}`;
	return null;
};

/** Founding dates may be known only to the year or month. */
export const getPartialDateValidationError = (value, today = getShanghaiDateKey()) => {
	if (typeof value !== 'string' || !/^\d{4}(?:-\d{2})?(?:-\d{2})?$/u.test(value)) {
		return '必须是有效的 YYYY、YYYY-MM 或 YYYY-MM-DD 日期';
	}
	const normalized = value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
	return getDateValidationError(normalized, today);
};

/** Add calendar months, clamping a month-end date to the target month's last day. */
export const addCalendarMonths = (dateKey, months) => {
	if (!isCalendarDate(dateKey)) throw new RangeError(`无效日历日期：${dateKey}`);
	if (!Number.isInteger(months)) throw new RangeError('月份增量必须是整数');
	const [year, month, day] = dateKey.split('-').map(Number);
	const absoluteMonth = year * 12 + month - 1 + months;
	const targetYear = Math.floor(absoluteMonth / 12);
	const targetMonth = absoluteMonth - targetYear * 12 + 1;
	if (targetYear < 1 || targetYear > 9999) throw new RangeError('目标年份超出 YYYY-MM-DD 范围');
	const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
	return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
};

/** Only an exact recorded Beijing HH:mm is precise enough to sort or classify. */
export const getRecordedTimeMinutes = (time) => {
	if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) return null;
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
};

/** Stored clocks are already Beijing time; approximate clocks retain their uncertainty. */
export const getRecordedTimeValidationError = (time) => {
	if (time === undefined || time === null || getRecordedTimeMinutes(time) !== null) return null;
	if (typeof time === 'string' && time.startsWith('约')
		&& getRecordedTimeMinutes(time.replace(/^约 ?/u, '')) !== null) return null;
	return '时间必须是北京时间 HH:mm 或“约 HH:mm”；GMT、UTC 或带偏移的原始时刻请先按原始时区换算北京时间，未知时间用 null';
};

/** Newest Beijing date/time first; uncertain times follow exact times on that date. */
export const compareTestsNewestFirst = (left, right) => {
	const dateOrder = left.testedAt < right.testedAt ? 1 : left.testedAt > right.testedAt ? -1 : 0;
	if (dateOrder) return dateOrder;
	const timeOrder = (getRecordedTimeMinutes(right.time) ?? -1) - (getRecordedTimeMinutes(left.time) ?? -1);
	if (timeOrder) return timeOrder;
	const leftId = left.id ?? '';
	const rightId = right.id ?? '';
	return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
};

/** Convert a source clock only with an explicit UTC/GMT/Z or signed HH:mm offset. */
export const toShanghaiRecordedTime = (dateKey, time, timeZone) => {
	if (!isCalendarDate(dateKey)) throw new RangeError(`无效日历日期：${dateKey}`);
	const minutes = getRecordedTimeMinutes(time);
	if (minutes === null) throw new RangeError('原始时刻必须是精确的 HH:mm');
	let offsetMinutes = 0;
	if (!['UTC', 'GMT', 'Z'].includes(timeZone)) {
		const offset = typeof timeZone === 'string' && timeZone.match(/^(?:UTC|GMT)?([+-])(0\d|1[0-4]):([0-5]\d)$/u);
		if (!offset || (offset[2] === '14' && offset[3] !== '00')) {
			throw new RangeError('必须明确原始时区：UTC、GMT、Z 或 ±HH:mm（最大 ±14:00）');
		}
		offsetMinutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
	}
	const [year, month, day] = dateKey.split('-').map(Number);
	// UTC setters avoid both host timezone parsing and Date.UTC's special handling of years 0–99.
	const sourceClock = new Date(0);
	sourceClock.setUTCFullYear(year, month - 1, day);
	sourceClock.setUTCHours(0, minutes + 8 * 60 - offsetMinutes, 0, 0);
	if (sourceClock.getUTCFullYear() < 1 || sourceClock.getUTCFullYear() > 9999) {
		throw new RangeError('换算后日期超出 YYYY-MM-DD 范围');
	}
	const converted = sourceClock.toISOString();
	return { testedAt: converted.slice(0, 10), time: converted.slice(11, 16) };
};

/** Preserve date precision when an exact local clock time was not recorded. */
export const toRecordedAtIso = (dateKey, time) => {
	if (!isCalendarDate(dateKey)) throw new RangeError(`无效日历日期：${dateKey}`);
	return getRecordedTimeMinutes(time) !== null
		? `${dateKey}T${time}:00+08:00` : dateKey;
};

/** Classify only an exact recorded China Standard Time; keep uncertain times unclassified. */
export const getTestWindow = (time) => {
	const minutes = getRecordedTimeMinutes(time);
	if (minutes === null) return null;
	if (minutes < 6 * 60) return '凌晨';
	if (minutes < 18 * 60) return '日间';
	return minutes >= 20 * 60 && minutes < 23 * 60 ? '晚高峰' : '晚间';
};
