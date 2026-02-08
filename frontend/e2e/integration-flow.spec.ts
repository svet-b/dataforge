import { test, expect } from './helpers/fixtures.js';
import { createPipeline, createNode, createEdge } from './helpers/api.js';

/**
 * End-to-end integration test: upload CSV → transform with aggregation → run → verify output.
 */
test.describe('Integration: CSV → Transform → Output', () => {
	test('uploads CSV, aggregates, runs, and verifies output', async ({ page }) => {
		// Use a large viewport so nodes are fully visible and minimap doesn't overlap
		await page.setViewportSize({ width: 1400, height: 900 });

		// --- Setup via API: pipeline + 3 nodes + 2 edges ---
		const pipeline = await createPipeline('CSV Integration Test');
		const fileNode = await createNode(pipeline.id, 'source_file', 'Sales Data', {
			outputTableName: 'sales_data',
			positionX: 0,
			positionY: 0,
		});
		const transformNode = await createNode(pipeline.id, 'transform', 'Aggregate', {
			outputTableName: 'aggregated',
			positionX: 300,
			positionY: 0,
		});
		const outputNode = await createNode(pipeline.id, 'output', 'Final Output', {
			outputTableName: 'final_output',
			positionX: 600,
			positionY: 0,
		});
		await createEdge(pipeline.id, fileNode.id, transformNode.id);
		await createEdge(pipeline.id, transformNode.id, outputNode.id);

		// --- Navigate to the pipeline editor ---
		await page.goto(`/pipelines/${pipeline.id}`);
		await expect(page.getByTestId('toolbar')).toBeVisible();

		// Wait for all 3 nodes to render in the canvas
		await expect(page.locator('.svelte-flow__node')).toHaveCount(3);

		// Helper: click a flow node by its backend data-id attribute
		async function clickNode(nodeId: string) {
			const node = page.locator(`.svelte-flow__node[data-id="${nodeId}"]`);
			await expect(node).toBeVisible();
			await node.click({ force: true, position: { x: 10, y: 10 } });
		}

		// ============================================================
		// Step 1: Upload a CSV file to the file source node
		// ============================================================
		await clickNode(fileNode.id);

		// Bottom panel should open with Config tab
		await expect(page.getByTestId('bottom-panel')).toBeVisible();

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
		await expect(page.getByTestId('bottom-panel').getByText('sales.csv')).toBeVisible();

		// Wait for debounced config save after file upload (500ms)
		await page.waitForTimeout(800);

		// ============================================================
		// Step 2: Configure the transform node with aggregation SQL
		// ============================================================
		await clickNode(transformNode.id);

		// Wait for the CodeMirror editor to appear in the config panel
		const cmEditor = page.locator('.cm-content');
		await expect(cmEditor).toBeVisible();

		// Type the aggregation SQL into CodeMirror
		await cmEditor.click();
		await page.keyboard.type(
			'SELECT product, SUM(amount) as total_amount FROM sales_data GROUP BY product ORDER BY product'
		);

		// Click Apply to save the config
		await page.getByRole('button', { name: 'Apply' }).click();
		await expect(page.getByText('Config saved')).toBeVisible();

		// ============================================================
		// Step 3: Configure the output node
		// ============================================================
		await clickNode(outputNode.id);

		// Wait for the output config panel to load — should show Source Table label
		const sourceSelect = page.getByTestId('bottom-panel').locator('select');
		await expect(sourceSelect).toBeVisible();
		await sourceSelect.selectOption('aggregated');

		// Wait for debounced save (500ms)
		await page.waitForTimeout(700);

		// ============================================================
		// Step 4: Run the pipeline
		// ============================================================
		await page.getByRole('button', { name: 'Run', exact: true }).click();
		await expect(page.getByTestId('run-dialog')).toBeVisible();

		await page.getByTestId('run-execute-btn').click();

		// Wait for run to complete — dialog closes
		await expect(page.getByTestId('run-dialog')).not.toBeVisible({ timeout: 30000 });

		// ============================================================
		// Step 5: Verify the output in Run History
		// ============================================================
		// After run, the bottom panel should switch to Run History tab
		await expect(page.getByTestId('tab-history')).toBeVisible();
		await expect(page.getByTestId('bottom-panel')).toBeVisible();

		// Should see a successful run entry (green dot + row count)
		const successDot = page.getByTestId('bottom-panel').locator('.bg-green-500').first();
		await expect(successDot).toBeVisible();
		await expect(page.getByTestId('bottom-panel').getByText('2 rows')).toBeVisible();

		// Expand the run to see details
		const runEntry = page.getByTestId('bottom-panel').locator('button').filter({ has: page.locator('.bg-green-500') }).first();
		await runEntry.click();

		// Should see "Node Timings" section in the expanded details
		await expect(page.getByText('Node Timings')).toBeVisible({ timeout: 5000 });

		// Now verify the actual data via the Preview feature on the transform node
		await clickNode(transformNode.id);
		await page.getByTestId('tab-config').click();
		const cmEditorAgain = page.locator('.cm-content');
		await expect(cmEditorAgain).toBeVisible();

		// Click the Preview button inside the transform config (not the tab)
		await page.getByRole('button', { name: 'Preview', exact: true }).nth(1).click();

		// Switch to Preview tab to see results
		await page.getByTestId('tab-preview').click();
		await expect(page.getByText('Showing')).toBeVisible({ timeout: 10000 });

		// Verify the aggregated data in the preview table
		const dataTable = page.getByTestId('bottom-panel').locator('table');
		await expect(dataTable).toBeVisible();
		await expect(dataTable.getByText('Gadget')).toBeVisible();
		await expect(dataTable.getByText('Widget')).toBeVisible();
		await expect(dataTable.getByText('450')).toBeVisible();
		await expect(dataTable.getByText('550')).toBeVisible();
	});
});
