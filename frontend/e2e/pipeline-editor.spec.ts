import { test, expect } from './helpers/fixtures.js';
import { createPipeline, addSource } from './helpers/api.js';

test.describe('Pipeline editor', () => {
	let pipelineId: string;

	test.beforeEach(async () => {
		const pipeline = await createPipeline('Editor Test');
		pipelineId = pipeline.id;
	});

	test('loads editor with toolbar and panels', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);

		await expect(page.getByTestId('toolbar')).toBeVisible();
		await expect(page.getByTestId('pipeline-name')).toHaveText('Editor Test');
		await expect(page.getByTestId('source-list')).toBeVisible();
		await expect(page.getByTestId('query-editor')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Parameters' })).toBeVisible();
	});

	test('adds a file source via Add button', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);
		await expect(page.getByTestId('source-list')).toBeVisible();

		await page.getByTestId('add-source-btn').click();
		await page.getByTestId('add-file-source').click();

		await expect(page.getByTestId('source-item')).toBeVisible();
	});

	test('adds an API source via Add button', async ({ page }) => {
		await page.goto(`/pipelines/${pipelineId}`);

		await page.getByTestId('add-source-btn').click();
		await page.getByTestId('add-api-source').click();

		await expect(page.getByTestId('source-item')).toBeVisible();
	});

	test('clicking source opens config panel', async ({ page }) => {
		await addSource(pipelineId, 'file', 'my_data');
		await page.goto(`/pipelines/${pipelineId}`);

		const sourceItem = page.getByTestId('source-item');
		await expect(sourceItem).toBeVisible();
		await sourceItem.click();

		await expect(page.getByTestId('source-config')).toBeVisible();
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
