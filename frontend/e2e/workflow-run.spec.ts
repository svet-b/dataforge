import { test, expect } from './helpers/fixtures.js';
import { createWorkflow, updateWorkflow } from './helpers/api.js';

test.describe('Workflow run', () => {
	test('runs workflow with simple query', async ({ page }) => {
		const workflow = await createWorkflow('Run Test');
		await updateWorkflow(workflow.id, { query: 'SELECT 1 as value' });

		await page.goto(`/workflows/${workflow.id}`);
		await expect(page.getByTestId('toolbar')).toBeVisible();

		// No params → Run executes directly (no dialog)
		await page.getByRole('button', { name: 'Run', exact: true }).click();

		// Should see results in the results panel
		await expect(page.getByText('Showing')).toBeVisible({ timeout: 15000 });

		// Run History tab should show an entry
		await page.getByTestId('tab-history').click();
		const successDot = page.locator('.bg-green-500').first();
		await expect(successDot).toBeVisible();
	});

	test('switches between results and history tabs', async ({ page }) => {
		const workflow = await createWorkflow('Tab Test');
		await page.goto(`/workflows/${workflow.id}`);

		// Results tab should be visible by default
		await expect(page.getByTestId('tab-results')).toBeVisible();
		await expect(page.getByTestId('tab-history')).toBeVisible();

		// Switch to History
		await page.getByTestId('tab-history').click();

		// Switch back to Results
		await page.getByTestId('tab-results').click();
	});
});
