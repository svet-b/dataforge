<script lang="ts">
	import type { SourceResponse, SourceType } from '$lib/types/index.js';
	import { addSource, deleteSource, selectSource, pipelineStore } from '$lib/stores/pipeline.js';

	let { pipelineId }: { pipelineId: string } = $props();

	let sources = $derived($pipelineStore.pipeline?.sources ?? []);
	let selectedSourceId = $derived($pipelineStore.selectedSourceId);

	let showAddMenu = $state(false);
	let sourceCounter = $state(0);

	function handleAdd(type: SourceType) {
		sourceCounter++;
		const tableName = type === 'file' ? `file_${sourceCounter}` : `api_${sourceCounter}`;
		addSource(pipelineId, type, tableName);
		showAddMenu = false;
	}

	function handleDelete(e: Event, sourceId: string) {
		e.stopPropagation();
		deleteSource(pipelineId, sourceId);
	}

	function handleSelect(sourceId: string) {
		selectSource(selectedSourceId === sourceId ? null : sourceId);
	}

	function typeIcon(type: string): string {
		return type === 'api' ? '\u2601' : '\u{1F4C4}';
	}

	function typeLabel(type: string): string {
		return type === 'api' ? 'API' : 'File';
	}
</script>

<div class="flex h-full flex-col" data-testid="source-list">
	<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Inputs</h3>
		<div class="relative">
			<button
				class="rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
				onclick={() => (showAddMenu = !showAddMenu)}
				data-testid="add-source-btn"
			>
				+ Add
			</button>
			{#if showAddMenu}
				<div class="absolute right-0 z-20 mt-1 w-36 rounded border border-gray-200 bg-white py-1 shadow-lg">
					<button
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
						onclick={() => handleAdd('file')}
						data-testid="add-file-source"
					>
						<span>&#128196;</span> File Source
					</button>
					<button
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
						onclick={() => handleAdd('api')}
						data-testid="add-api-source"
					>
						<span>&#9729;</span> API Source
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="flex-1 overflow-y-auto">
		{#if sources.length === 0}
			<div class="px-3 py-6 text-center text-xs text-gray-400">
				No input sources yet.<br />Click + Add to get started.
			</div>
		{:else}
			{#each sources as source (source.id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					class="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left transition-colors hover:bg-gray-50 cursor-pointer {selectedSourceId === source.id ? 'bg-blue-50' : ''}"
					onclick={() => handleSelect(source.id)}
					data-testid="source-item"
				>
					<span class="text-base">{typeIcon(source.type)}</span>
					<div class="flex-1 min-w-0">
						<div class="truncate text-sm font-medium text-gray-800">{source.table_name}</div>
						<div class="text-xs text-gray-400">{typeLabel(source.type)}</div>
					</div>
					<button
						class="shrink-0 rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
						onclick={(e) => handleDelete(e, source.id)}
						aria-label="Remove source"
					>
						<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>
