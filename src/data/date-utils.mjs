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

/** Preserve date precision when an exact local clock time was not recorded. */
export const toRecordedAtIso = (dateKey, time) => {
	if (!isCalendarDate(dateKey)) throw new RangeError(`无效日历日期：${dateKey}`);
	return typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)
		? `${dateKey}T${time}:00+08:00` : dateKey;
};
