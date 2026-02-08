<script lang="ts">
	import { pipelineStore, updateNodeConfig } from '$lib/stores/pipeline.js';
	import { debounce } from '$lib/utils/debounce.js';

	let {
		pipelineId,
		nodeId,
		config,
		outputTableName
	}: {
		pipelineId: string;
		nodeId: string;
		config: Record<string, unknown>;
		outputTableName: string;
	} = $props();

	let sourceTable = $state((config.source_table as string) ?? '');
	let tableName = $state(outputTableName);

	let allTables = $derived(
		$pipelineStore.nodes
			.filter((n) => n.id !== nodeId)
			.map((n) => n.data.outputTableName)
			.filter(Boolean)
	);

	const saveConfig = debounce(() => {
		updateNodeConfig(pipelineId, nodeId, {
			config: { source_table: sourceTable || undefined },
			output_table_name: tableName || undefined
		});
	}, 500);

	function onchange() {
		saveConfig();
	}
</script>

<div class="space-y-3 p-3">
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Source Table</label>
		<select
			class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
			bind:value={sourceTable}
			onchange={onchange}
		>
			<option value="">Select a table...</option>
			{#each allTables as table}
				<option value={table}>{table}</option>
			{/each}
		</select>
	</div>

	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Output Table</label>
		<input
			class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
			bind:value={tableName}
			oninput={onchange}
			placeholder="output_data"
		/>
	</div>
</div>
