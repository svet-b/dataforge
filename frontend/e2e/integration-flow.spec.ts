import { test, expect } from './helpers/fixtures.js';
import { createPipeline, addSource, updatePipeline } from './helpers/api.js';

/**
 * End-to-end integration test: upload CSV → write query → run → verify output.
 */
test.describe('Integration: CSV → SQL Query → Run', () => {
	test('uploads CSV, writes query, runs, and verifies output', async ({ page }) => {
		await page.setViewportSize({ width: 1400, height: 900 });

		// --- Setup via API: pipeline + file source ---
		const pipeline = await createPipeline('CSV Integration Test');
		await addSource(pipeline.id, 'file', 'sales_data');

		// --- Navigate to the pipeline editor ---
		await page.goto(`/pipelines/${pipeline.id}`);
		await expect(page.getByTestId('toolbar')).toBeVisible();

		// Should see the source list with our source
		await expect(page.getByTestId('source-list')).toBeVisible();
		await expect(page.getByTestId('source-item')).toHaveCount(1);

		// ============================================================
		// Step 1: Click the source to configure it and upload a CSV
		// ============================================================
		await page.getByTestId('source-item').click();
		await expect(page.getByTestId('source-config')).toBeVisible();

		// Upload a CSV file via the file input
		const csvContent = [
			'product,region,amount',
			'Widget,North,100',
			'Widget,South,150',
			'Gadget,North,200',
			'Gadget,South,250',
			'Widget,North,300',
		].join('\n');

		const fileInput = page.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: 'sales.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csvContent),
		});

		// Should show upload success toast and filename in the config panel
		await expect(page.getByTestId('toast').first()).toBeVisible();
		await expect(page.getByTestId('source-config').getByText('sales.csv')).toBeVisible();

		// Wait for debounced config save (500ms)
		await page.waitForTimeout(800);

		// ============================================================
		// Step 2: Set the query via API (CodeMirror needs special handling
		// for Playwright typing, so we set it programmatically)
		// ============================================================
		const sqlQuery =
			'SELECT product, SUM(amount) as total_amount FROM sales_data GROUP BY product ORDER BY product';
		await updatePipeline(pipeline.id, { query: sqlQuery });

		// Reload so the editor picks up the query
		await page.reload();
		await expect(page.getByTestId('toolbar')).toBeVisible();

		// Verify the query appears in the CodeMirror editor
		const cmEditor = page.locator('.cm-content');
		await expect(cmEditor).toBeVisible();
		await expect(cmEditor).toContainText('SELECT product');

		// ============================================================
		// Step 3: Preview the results
		// ============================================================
		await page.getByTestId('preview-btn').click();

		// Should see results in the results panel
		await expect(page.getByText('Showing')).toBeVisible({ timeout: 10000 });

		const dataTable = page.locator('table').last();
		await expect(dataTable).toBeVisible();
		await expect(dataTable.getByText('Gadget')).toBeVisible();
		await expect(dataTable.getByText('Widget')).toBeVisible();
		await expect(dataTable.getByText('450')).toBeVisible();
		await expect(dataTable.getByText('550')).toBeVisible();

		// ============================================================
		// Step 4: Run the pipeline
		// ============================================================
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-execute-btn').click();

		// Wait for run to complete — dialog closes
		await expect(page.getByTestId('run-dialog')).not.toBeVisible({ timeout: 30000 });

		// ============================================================
		// Step 5: Verify Run History
		// ============================================================
		await page.getByTestId('tab-history').click();

		// Should see a successful run entry
		const successDot = page.locator('.bg-green-500').first();
		await expect(successDot).toBeVisible();
		// Check "2 rows" in the history list (not the toast)
		await expect(page.getByText('2 rows').first()).toBeVisible();
	});
});
