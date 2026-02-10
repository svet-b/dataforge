<script lang="ts">
	import { untrack } from 'svelte';
	import { updatePipelineQuery, pipelineStore } from '$lib/stores/pipeline.js';
	import { debounce } from '$lib/utils/debounce.js';
	import SqlEditor from '$lib/components/panel/config/SqlEditor.svelte';

	let {
		pipelineId,
		onRun,
	}: {
		pipelineId: string;
		onRun: () => void;
	} = $props();

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

	export function setSql(sql: string) {
		queryValue = sql;
		saveQuery(sql);
	}
</script>

<div class="flex h-full flex-col" data-testid="query-editor">
	<!-- Header bar -->
	<div class="flex items-center justify-between border-b border-gray-200 px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">SQL Query</h3>
		<span class="text-xs text-gray-400">
			{navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter to run
		</span>
	</div>

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
