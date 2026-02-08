import { test as base, expect } from '@playwright/test';
import { deleteAllPipelines } from './api.js';

export const test = base.extend({
	page: async ({ page }, use) => {
		await use(page);
		await deleteAllPipelines();
	},
});

export { expect };
