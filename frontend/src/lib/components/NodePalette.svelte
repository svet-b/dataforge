<script lang="ts">
	import { Panel, useSvelteFlow } from '@xyflow/svelte';
	import { addNodeAction, pipelineStore } from '$lib/stores/pipeline.js';
	import type { NodeType } from '$lib/types/index.js';

	let { pipelineId }: { pipelineId: string } = $props();

	const { screenToFlowPosition } = useSvelteFlow();

	const buttons: { type: NodeType; label: string; color: string }[] = [
		{ type: 'source_api', label: 'API Source', color: 'bg-blue-500 hover:bg-blue-600' },
		{ type: 'source_file', label: 'File Source', color: 'bg-green-500 hover:bg-green-600' },
		{ type: 'transform', label: 'Transform', color: 'bg-orange-500 hover:bg-orange-600' },
		{ type: 'output', label: 'Output', color: 'bg-purple-500 hover:bg-purple-600' }
	];

	function addNode(type: NodeType) {
		// Place at the center of the current viewport
		const center = screenToFlowPosition({
			x: window.innerWidth / 2,
			y: window.innerHeight / 2
		});
		addNodeAction(pipelineId, type, center.x, center.y);
	}
</script>

<Panel position="top-right" class="flex gap-2">
	{#each buttons as btn}
		<button
			data-testid="add-node-{btn.type}"
			class="{btn.color} rounded px-3 py-1.5 text-xs font-medium text-white shadow transition-colors"
			onclick={() => addNode(btn.type)}
		>
			+ {btn.label}
		</button>
	{/each}
</Panel>
