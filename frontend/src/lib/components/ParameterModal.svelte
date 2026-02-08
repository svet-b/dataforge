<script lang="ts">
	import type { PipelineParameter } from '$lib/types/index.js';
	import { updatePipelineParams } from '$lib/stores/pipeline.js';

	let {
		pipelineId,
		parameters,
		onClose
	}: {
		pipelineId: string;
		parameters: PipelineParameter[];
		onClose: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let rows = $state<PipelineParameter[]>(
		parameters.length > 0
			? parameters.map((p) => ({ ...p }))
			: []
	);

	let nameError = $state('');

	function addRow() {
		rows = [...rows, { name: '', type: 'string', default: '', description: '' }];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, i) => i !== index);
	}

	function validate(): boolean {
		const names = rows.map((r) => r.name.trim()).filter(Boolean);
		const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
		for (const name of names) {
			if (!identifierRegex.test(name)) {
				nameError = `Invalid name: "${name}" (must be a valid identifier)`;
				return false;
			}
		}
		if (new Set(names).size !== names.length) {
			nameError = 'Duplicate parameter names';
			return false;
		}
		nameError = '';
		return true;
	}

	async function save() {
		if (!validate()) return;
		const cleaned = rows
			.filter((r) => r.name.trim())
			.map((r) => ({
				name: r.name.trim(),
				type: r.type,
				default: r.default || null,
				description: r.description || null
			}));
		await updatePipelineParams(pipelineId, cleaned);
		onClose();
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	onclick={onBackdropClick}
>
	<div class="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl" data-testid="parameter-modal">
		<h2 class="mb-4 text-lg font-semibold text-gray-800">Pipeline Parameters</h2>

		{#if nameError}
			<div class="mb-3 rounded bg-red-50 p-2 text-sm text-red-600">{nameError}</div>
		{/if}

		<div class="max-h-80 space-y-2 overflow-y-auto">
			{#each rows as row, i}
				<div class="flex items-start gap-2 rounded border border-gray-200 p-2">
					<div class="flex-1">
						<input
							class="mb-1 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
							placeholder="Name"
							bind:value={row.name}
						/>
						<div class="flex gap-1">
							<select
								class="w-24 rounded border border-gray-300 px-1 py-1 text-xs focus:border-blue-500 focus:outline-none"
								bind:value={row.type}
							>
								<option value="string">string</option>
								<option value="number">number</option>
								<option value="boolean">boolean</option>
							</select>
							<input
								class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
								placeholder="Default value"
								bind:value={row.default}
							/>
						</div>
						<input
							class="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
							placeholder="Description"
							bind:value={row.description}
						/>
					</div>
					<button
						class="mt-1 text-gray-400 hover:text-red-500"
						onclick={() => removeRow(i)}
						aria-label="Remove parameter"
					>
						<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/each}
		</div>

		<button class="mt-2 text-sm text-blue-600 hover:text-blue-700" onclick={addRow}>
			+ Add Parameter
		</button>

		<div class="mt-4 flex justify-end gap-2">
			<button
				class="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
				onclick={save}
			>
				Save
			</button>
		</div>
	</div>
</div>
