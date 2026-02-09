import { test, expect } from './helpers/fixtures.js';
import { createPipeline, updatePipeline } from './helpers/api.js';

test.describe('Pipeline run', () => {
	test('runs pipeline with simple query', async ({ page }) => {
		const pipeline = await createPipeline('Run Test');
		await updatePipeline(pipeline.id, { query: 'SELECT 1 as value' });

		await page.goto(`/pipelines/${pipeline.id}`);
		await expect(page.getByTestId('toolbar')).toBeVisible();

		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-execute-btn').click();

		// Wait for run to complete -- dialog closes and toast appears
		await expect(page.getByTestId('run-dialog')).not.toBeVisible({ timeout: 15000 });
		await expect(page.getByTestId('toast').first()).toBeVisible();

		// Run History tab should show an entry
		await page.getByTestId('tab-history').click();
	});

	test('opens run dialog and cancels', async ({ page }) => {
		const pipeline = await createPipeline('Cancel Run Test');
		await page.goto(`/pipelines/${pipeline.id}`);

		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-dialog').getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('run-dialog')).not.toBeVisible();
	});

	test('switches between results and history tabs', async ({ page }) => {
		const pipeline = await createPipeline('Tab Test');
		await page.goto(`/pipelines/${pipeline.id}`);

		// Results tab should be visible by default
		await expect(page.getByTestId('tab-results')).toBeVisible();
		await expect(page.getByTestId('tab-history')).toBeVisible();

		// Switch to History
		await page.getByTestId('tab-history').click();

		// Switch back to Results
		await page.getByTestId('tab-results').click();
	});
});
