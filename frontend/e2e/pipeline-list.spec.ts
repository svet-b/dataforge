import { test, expect } from './helpers/fixtures.js';
import { createPipeline } from './helpers/api.js';

test.describe('Pipeline list page', () => {
	test('shows empty state', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('empty-state')).toBeVisible();
		await expect(page.getByText('No pipelines yet')).toBeVisible();
	});

	test('creates pipeline and navigates to editor', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'New Pipeline' }).click();
		await expect(page.getByTestId('create-pipeline-modal')).toBeVisible();

		await page.getByLabel('Name').fill('Test Pipeline');
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page).toHaveURL(/\/pipelines\/.+/);
		await expect(page.getByTestId('pipeline-editor')).toBeVisible();
	});

	test('shows existing pipeline cards', async ({ page }) => {
		const pipeline = await createPipeline('Existing Pipeline', 'A test pipeline');
		await page.goto('/');

		const card = page.getByTestId('pipeline-card').filter({ hasText: 'Existing Pipeline' });
		await expect(card).toBeVisible();

		await card.getByRole('link').click();
		await expect(page).toHaveURL(`/pipelines/${pipeline.id}`);
	});

	test('deletes a pipeline', async ({ page }) => {
		await createPipeline('To Delete');
		await page.goto('/');

		const card = page.getByTestId('pipeline-card').filter({ hasText: 'To Delete' });
		await expect(card).toBeVisible();

		await card.getByRole('button', { name: 'Delete pipeline' }).click();
		await expect(page.getByTestId('delete-confirm-modal')).toBeVisible();

		await page.getByTestId('delete-confirm-modal').getByRole('button', { name: 'Delete' }).click();
		await expect(card).not.toBeVisible();
		await expect(page.getByTestId('toast')).toBeVisible();
	});

	test('cancel create modal', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'New Pipeline' }).click();
		await expect(page.getByTestId('create-pipeline-modal')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('create-pipeline-modal')).not.toBeVisible();
	});
});
