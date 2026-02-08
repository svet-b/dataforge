<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import {
		pipelineStore,
		loadPipeline,
		resetPipelineStore
	} from '$lib/stores/pipeline.js';
	import DagCanvas from '$lib/components/dag/DagCanvas.svelte';
	import NodePalette from '$lib/components/NodePalette.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';

	const pipelineId = page.params.id!;

	let nodes = $state($pipelineStore.nodes);
	let edges = $state($pipelineStore.edges);

	onMount(() => {
		loadPipeline(pipelineId);
	});

	onDestroy(() => {
		resetPipelineStore();
	});

	// Sync store → local state when store updates (e.g., after load, after add/delete)
	$effect(() => {
		nodes = $pipelineStore.nodes;
		edges = $pipelineStore.edges;
	});
</script>

{#if $pipelineStore.loading}
	<div class="flex h-screen items-center justify-center text-gray-500">Loading pipeline...</div>
{:else if $pipelineStore.error}
	<div class="flex h-screen items-center justify-center text-red-500">
		Error: {$pipelineStore.error}
	</div>
{:else if $pipelineStore.pipeline}
	<div class="flex h-screen flex-col">
		<Toolbar pipelineId={pipelineId} pipelineName={$pipelineStore.pipeline.name} />
		<div class="flex-1">
			<DagCanvas {pipelineId} bind:nodes bind:edges>
				<NodePalette {pipelineId} />
			</DagCanvas>
		</div>
	</div>
{/if}
