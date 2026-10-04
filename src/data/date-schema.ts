import { z } from 'astro/zod';
import { getDateValidationError, getPartialDateValidationError } from './date-utils.mjs';

export const historicalDateSchema = z.string().superRefine((value, context) => {
	const message = getDateValidationError(value);
	if (message) context.addIssue({ code: 'custom', message });
});

export const foundedDateSchema = z.string().superRefine((value, context) => {
	const message = getPartialDateValidationError(value);
	if (message) context.addIssue({ code: 'custom', message });
});
