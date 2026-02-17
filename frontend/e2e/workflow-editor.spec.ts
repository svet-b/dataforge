import { test, expect } from './helpers/fixtures.js';
import { createWorkflow, addSource } from './helpers/api.js';

test.describe('Workflow editor', () => {
	let workflowId: string;

	test.beforeEach(async () => {
		const workflow = await createWorkflow('Editor Test');
		workflowId = workflow.id;
	});

	test('loads editor with toolbar and panels', async ({ page }) => {
		await page.goto(`/workflows/${workflowId}`);

		await expect(page.getByTestId('toolbar')).toBeVisible();
		await expect(page.getByTestId('workflow-name')).toHaveText('Editor Test');
		await expect(page.getByTestId('source-list')).toBeVisible();
		await expect(page.getByTestId('query-editor')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Parameters' })).toBeVisible();
	});

	test('adds a file source via Add button', async ({ page }) => {
		await page.goto(`/workflows/${workflowId}`);
		await expect(page.getByTestId('source-list')).toBeVisible();

		await page.getByTestId('add-source-btn').click();
		await page.getByTestId('add-file-source').click();

		await expect(page.getByTestId('source-item')).toBeVisible();
	});

	test('adds an API source via Add button', async ({ page }) => {
		await page.goto(`/workflows/${workflowId}`);

		await page.getByTestId('add-source-btn').click();
		await page.getByTestId('add-api-source').click();

		await expect(page.getByTestId('source-item')).toBeVisible();
	});

	test('clicking source opens config panel', async ({ page }) => {
		await addSource(workflowId, 'file', 'my_data');
		await page.goto(`/workflows/${workflowId}`);

		const sourceItem = page.getByTestId('source-item');
		await expect(sourceItem).toBeVisible();
		await sourceItem.click();

		await expect(page.getByTestId('source-config')).toBeVisible();
	});

	test('renames workflow', async ({ page }) => {
		await page.goto(`/workflows/${workflowId}`);

		await page.getByTestId('workflow-name').click();
		const input = page.getByTestId('workflow-name-input');
		await expect(input).toBeVisible();

		await input.fill('Renamed Workflow');
		await input.press('Enter');

		await expect(page.getByTestId('workflow-name')).toHaveText('Renamed Workflow');
		await expect(page.getByTestId('toast').first()).toBeVisible();
	});

	test('opens and closes Parameter modal', async ({ page }) => {
		await page.goto(`/workflows/${workflowId}`);

		await page.getByRole('button', { name: 'Parameters' }).click();
		await expect(page.getByTestId('parameter-modal')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('parameter-modal')).not.toBeVisible();
	});
});
