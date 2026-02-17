import { test as base, expect } from '@playwright/test';
import { deleteAllWorkflows } from './api.js';

export const test = base.extend({
	page: async ({ page }, use) => {
		await use(page);
		await deleteAllWorkflows();
	},
});

export { expect };
