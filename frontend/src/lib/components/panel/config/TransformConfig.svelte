<script lang="ts">
	import { pipelineStore, updateNodeConfig } from '$lib/stores/pipeline.js';
	import { runPreview } from '$lib/stores/preview.js';
	import { addToast } from '$lib/stores/toasts.js';
	import SqlEditor from './SqlEditor.svelte';

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

	let sqlValue = $state((config.sql as string) ?? '');
	let description = $state((config.description as string) ?? '');
	let tableName = $state(outputTableName);
	let sqlEditor: SqlEditor | undefined = $state();

	let upstreamTables = $derived.by(() => {
		const currentNodeEdges = $pipelineStore.edges.filter((e) => e.target === nodeId);
		const sourceNodeIds = new Set(currentNodeEdges.map((e) => e.source));
		return $pipelineStore.nodes
			.filter((n) => sourceNodeIds.has(n.id))
			.map((n) => n.data.outputTableName);
	});

	let parameters = $derived($pipelineStore.pipeline?.parameters ?? []);

	function insertText(text: string) {
		sqlEditor?.insertAtCursor(text);
	}

	async function saveConfig() {
		await updateNodeConfig(pipelineId, nodeId, {
			config: { sql: sqlValue, description: description || undefined },
			output_table_name: tableName || undefined
		});
		addToast('Config saved', 'success');
	}

	async function handlePreview() {
		await saveConfig();
		runPreview(pipelineId, nodeId);
	}
</script>

<div class="flex h-full">
	<!-- Left: schema reference -->
	<div class="w-56 shrink-0 overflow-y-auto border-r border-gray-200 p-3">
		<div class="mb-3">
			<h4 class="mb-1 text-xs font-semibold uppercase text-gray-500">Upstream Tables</h4>
			{#if upstreamTables.length === 0}
				<p class="text-xs text-gray-400">No upstream nodes</p>
			{:else}
				{#each upstreamTables as table}
					<button
						class="mb-0.5 block w-full rounded px-2 py-1 text-left text-xs text-blue-600 hover:bg-blue-50"
						onclick={() => insertText(table)}
					>
						{table}
					</button>
				{/each}
			{/if}
		</div>

		{#if parameters.length > 0}
			<div class="mb-3">
				<h4 class="mb-1 text-xs font-semibold uppercase text-gray-500">Parameters</h4>
				{#each parameters as param}
					<button
						class="mb-0.5 block w-full rounded px-2 py-1 text-left text-xs text-purple-600 hover:bg-purple-50"
						onclick={() => insertText(`{{${param.name}}}`)}
					>
						{`{${param.name}}`}
					</button>
				{/each}
			</div>
		{/if}

		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Output Table</label>
			<input
				class="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
				bind:value={tableName}
				placeholder="transform_result"
			/>
		</div>
	</div>

	<!-- Right: SQL editor + actions -->
	<div class="flex flex-1 flex-col p-3">
		<div class="flex-1">
			<SqlEditor bind:this={sqlEditor} bind:value={sqlValue} onRunPreview={handlePreview} />
		</div>

		<div class="mt-2 flex items-center gap-2">
			<button
				class="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
				onclick={saveConfig}
			>
				Apply
			</button>
			<button
				class="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
				onclick={handlePreview}
			>
				Preview
			</button>
		</div>

		<div class="mt-2">
			<textarea
				class="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
				rows="2"
				bind:value={description}
				placeholder="Description (optional)"
			></textarea>
		</div>
	</div>
</div>
