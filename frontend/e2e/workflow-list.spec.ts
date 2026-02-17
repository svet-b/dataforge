import { test, expect } from './helpers/fixtures.js';
import { createWorkflow } from './helpers/api.js';

test.describe('Workflow list page', () => {
	test('shows empty state', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('empty-state')).toBeVisible();
		await expect(page.getByText('No workflows yet')).toBeVisible();
	});

	test('creates workflow and navigates to editor', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'New Workflow' }).click();
		await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

		await page.getByLabel('Name').fill('Test Workflow');
		await page.getByRole('button', { name: 'Create' }).click();

		await expect(page).toHaveURL(/\/workflows\/.+/);
		await expect(page.getByTestId('workflow-editor')).toBeVisible();
	});

	test('shows existing workflow cards', async ({ page }) => {
		const workflow = await createWorkflow('Existing Workflow', 'A test workflow');
		await page.goto('/');

		const card = page.getByTestId('workflow-card').filter({ hasText: 'Existing Workflow' });
		await expect(card).toBeVisible();

		await card.getByRole('link').click();
		await expect(page).toHaveURL(`/workflows/${workflow.id}`);
	});

	test('deletes a workflow', async ({ page }) => {
		await createWorkflow('To Delete');
		await page.goto('/');

		const card = page.getByTestId('workflow-card').filter({ hasText: 'To Delete' });
		await expect(card).toBeVisible();

		await card.getByRole('button', { name: 'Delete workflow' }).click();
		await expect(page.getByTestId('delete-confirm-modal')).toBeVisible();

		await page.getByTestId('delete-confirm-modal').getByRole('button', { name: 'Delete' }).click();
		await expect(card).not.toBeVisible();
		await expect(page.getByTestId('toast')).toBeVisible();
	});

	test('cancel create modal', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'New Workflow' }).click();
		await expect(page.getByTestId('create-workflow-modal')).toBeVisible();

		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('create-workflow-modal')).not.toBeVisible();
	});
});
