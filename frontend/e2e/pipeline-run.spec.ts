import { test, expect } from './helpers/fixtures.js';
import { createPipeline, createNode, createEdge } from './helpers/api.js';

test.describe('Pipeline run', () => {
	test('runs pipeline with simple transform', async ({ page }) => {
		const pipeline = await createPipeline('Run Test');
		const transform = await createNode(pipeline.id, 'transform', 'Select One', {
			config: { query: 'SELECT 1 as value' },
			outputTableName: 'select_one',
		});
		const output = await createNode(pipeline.id, 'output', 'Result', {
			config: { format: 'json' },
			outputTableName: 'result',
			positionX: 300,
		});
		await createEdge(pipeline.id, transform.id, output.id);

		await page.goto(`/pipelines/${pipeline.id}`);
		await expect(page.getByTestId('toolbar')).toBeVisible();

		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-execute-btn').click();

		// Wait for run to complete — dialog closes and toast appears
		await expect(page.getByTestId('run-dialog')).not.toBeVisible({ timeout: 15000 });
		await expect(page.getByTestId('toast').first()).toBeVisible();

		// Run History tab should be active and show an entry
		await expect(page.getByTestId('tab-history')).toBeVisible();
	});

	test('opens run dialog and cancels', async ({ page }) => {
		const pipeline = await createPipeline('Cancel Run Test');
		await page.goto(`/pipelines/${pipeline.id}`);

		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-dialog').getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('run-dialog')).not.toBeVisible();
	});

	test('switches between bottom panel tabs', async ({ page }) => {
		const pipeline = await createPipeline('Tab Test');
		await createNode(pipeline.id, 'transform', 'Test Node');

		await page.goto(`/pipelines/${pipeline.id}`);
		const node = page.locator('.svelte-flow__node');
		await expect(node).toBeVisible();
		await node.click();

		await expect(page.getByTestId('bottom-panel')).toBeVisible();

		// Config tab active by default
		await expect(page.getByTestId('tab-config')).toBeVisible();

		// Switch to Preview
		await page.getByTestId('tab-preview').click();

		// Switch to Run History
		await page.getByTestId('tab-history').click();

		// Back to Config
		await page.getByTestId('tab-config').click();
	});
});
