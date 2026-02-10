<script lang="ts">
	import { untrack } from 'svelte';
	import { updatePipelineQuery, pipelineStore } from '$lib/stores/pipeline.js';
	import { debounce } from '$lib/utils/debounce.js';
	import SqlEditor from '$lib/components/panel/config/SqlEditor.svelte';

	let {
		pipelineId,
		onRun,
		showAiChat = $bindable(false)
	}: {
		pipelineId: string;
		onRun: () => void;
		showAiChat: boolean;
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

	function handleRun() {
		saveQuery.cancel();
		updatePipelineQuery(pipelineId, queryValue).then(() => {
			onRun();
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

	export function setSql(sql: string) {
		queryValue = sql;
		saveQuery(sql);
	}
</script>

<div class="flex h-full flex-col" data-testid="query-editor">
	<!-- Header bar -->
	<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">SQL Query</h3>
		<div class="flex items-center gap-2">
			<button
				class="rounded px-2 py-0.5 text-xs font-medium transition-colors {showAiChat
					? 'bg-violet-100 text-violet-700'
					: 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}"
				onclick={() => (showAiChat = !showAiChat)}
				title="Toggle AI assistant"
			>
				AI
			</button>
			<span class="text-xs text-gray-400">
				{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to run
			</span>
		</div>
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
			onRunPreview={handleRun}
			onchange={handleQueryChange}
			placeholder="SELECT * FROM my_table..."
		/>
	</div>
</div>
