<script lang="ts">
	import type { SourceResponse, PipelineParameter } from '$lib/types/index.js';
	import { untrack } from 'svelte';
	import { updatePipelineQuery, pipelineStore } from '$lib/stores/pipeline.js';
	import { runPreview } from '$lib/stores/preview.js';
	import { debounce } from '$lib/utils/debounce.js';
	import SqlEditor from '$lib/components/panel/config/SqlEditor.svelte';

	let {
		pipelineId,
	}: {
		pipelineId: string;
	} = $props();

	let sources = $derived($pipelineStore.pipeline?.sources ?? []);
	let parameters = $derived($pipelineStore.pipeline?.parameters ?? []);
	let queryValue = $state($pipelineStore.pipeline?.query ?? '');

	// Sync from store when pipeline loads (untrack queryValue so typing doesn't re-trigger)
	$effect(() => {
		const pipelineQuery = $pipelineStore.pipeline?.query ?? '';
		if (pipelineQuery !== untrack(() => queryValue)) {
			queryValue = pipelineQuery;
		}
	});

	const saveQuery = debounce((...args: unknown[]) => {
		updatePipelineQuery(pipelineId, args[0] as string);
	}, 800);

	let sqlEditor: SqlEditor | undefined = $state();

	function handleQueryChange(newValue: string) {
		queryValue = newValue;
		saveQuery(newValue);
	}

	function handlePreview() {
		saveQuery.cancel();
		updatePipelineQuery(pipelineId, queryValue).then(() => {
			runPreview(pipelineId);
		});
	}

	function insertTableRef(tableName: string) {
		if (sqlEditor) {
			sqlEditor.insertAtCursor(tableName);
		}
	}

	function insertParamRef(paramName: string) {
		if (sqlEditor) {
			sqlEditor.insertAtCursor(`getvariable('${paramName}')`);
		}
	}
</script>

<div class="flex h-full flex-col" data-testid="query-editor">
	<!-- Header bar -->
	<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">SQL Query</h3>
		<button
			class="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
			onclick={handlePreview}
			data-testid="preview-btn"
		>
			Preview
		</button>
	</div>

	<!-- Reference pills: available tables and parameters -->
	{#if sources.length > 0 || parameters.length > 0}
		<div class="flex flex-wrap gap-1 border-b border-gray-100 px-3 py-1.5">
			{#each sources as source}
				<button
					class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
					onclick={() => insertTableRef(source.table_name)}
					title="Click to insert table name"
				>
					{source.table_name}
				</button>
			{/each}
			{#each parameters as param}
				<button
					class="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
					onclick={() => insertParamRef(param.name)}
					title="Click to insert parameter reference"
				>
					${param.name}
				</button>
			{/each}
		</div>
	{/if}

	<!-- SQL editor -->
	<div class="flex-1 overflow-auto p-2">
		<SqlEditor
			bind:this={sqlEditor}
			bind:value={queryValue}
			onRunPreview={handlePreview}
			onchange={handleQueryChange}
			placeholder="SELECT * FROM my_table..."
		/>
	</div>
</div>
