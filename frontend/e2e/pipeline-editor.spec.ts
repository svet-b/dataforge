import { test, expect } from './helpers/fixtures.js';
import { createPipeline, createNode } from './helpers/api.js';

test.describe('Pipeline editor', () => {
	let pipelineId: string;

	test.beforeEach(async () => {
		const pipeline = await createPipeline('Editor Test');
		pipelineId = pipeline.id;
	});

	test('loads editor with toolbar and canvas', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);

		await expect(page.getByTestId('toolbar')).toBeVisible();
		await expect(page.getByTestId('pipeline-name')).toHaveText('Editor Test');
		await expect(page.getByTestId('dag-canvas')).toBeVisible();
		await expect(page.getByTestId('add-node-transform')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Parameters' })).toBeVisible();
	});

	test('adds a node via palette', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);
		await expect(page.getByTestId('dag-canvas')).toBeVisible();

		await page.getByTestId('add-node-transform').click();
		await expect(page.locator('.svelte-flow__node')).toBeVisible();
	});

	test('adds multiple nodes', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);
		await expect(page.getByTestId('dag-canvas')).toBeVisible();

		await page.getByTestId('add-node-source_file').click();
		await page.getByTestId('add-node-transform').click();
		await page.getByTestId('add-node-output').click();

		await expect(page.locator('.svelte-flow__node')).toHaveCount(3);
	});

	test('clicking node opens bottom panel', async ({ page }) => {
		await createNode(pipelineId, 'transform', 'My Transform');
		await page.goto(`/pipelines/${pipelineId}`);

		const node = page.locator('.svelte-flow__node');
		await expect(node).toBeVisible();
		await node.click();

		await expect(page.getByTestId('bottom-panel')).toBeVisible();
		await expect(page.getByTestId('tab-config')).toBeVisible();
	});

	test('clicking pane closes panel config', async ({ page }) => {
		await createNode(pipelineId, 'transform', 'My Transform');
		await page.goto(`/pipelines/${pipelineId}`);

		const node = page.locator('.svelte-flow__node');
		await expect(node).toBeVisible();
		await node.click();
		await expect(page.getByTestId('bottom-panel')).toBeVisible();

		await page.locator('.svelte-flow__pane').click();
		await expect(page.getByTestId('config-placeholder')).toBeVisible();
	});

	test('renames pipeline', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);

		await page.getByTestId('pipeline-name').click();
		const input = page.getByTestId('pipeline-name-input');
		await expect(input).toBeVisible();

		await input.fill('Renamed Pipeline');
		await input.press('Enter');

		await expect(page.getByTestId('pipeline-name')).toHaveText('Renamed Pipeline');
		await expect(page.getByTestId('toast').first()).toBeVisible();
	});

	test('opens and closes Parameter modal', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);

		await page.getByRole('button', { name: 'Parameters' }).click();
		await expect(page.getByTestId('parameter-modal')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('parameter-modal')).not.toBeVisible();
	});
});
