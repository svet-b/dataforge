<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		SvelteFlow,
		Background,
		Controls,
		MiniMap,
		type Node,
		type Edge,
		type Connection
	} from '@xyflow/svelte';
	import { nodeTypes } from './nodeTypes.js';
	import {
		addEdgeAction,
		deleteNodeAction,
		deleteEdgeAction,
		updateNodePosition
	} from '$lib/stores/pipeline.js';
	import type { FlowNodeData } from '$lib/utils/mappers.js';

	let {
		pipelineId,
		nodes = $bindable<Node<FlowNodeData>[]>([]),
		edges = $bindable<Edge[]>([]),
		onNodeSelect,
		children
	}: {
		pipelineId: string;
		nodes: Node<FlowNodeData>[];
		edges: Edge[];
		onNodeSelect?: (nodeId: string | null) => void;
		children?: Snippet;
	} = $props();

	function onconnect(connection: Connection) {
		const { source, target } = connection;
		if (!source || !target) return;

		addEdgeAction(pipelineId, source, target).then((edge) => {
			if (!edge) {
				// Remove the auto-added edge on failure
				edges = edges.filter(
					(e) => !(e.source === source && e.target === target)
				);
			}
		});
	}

	function onnodedragstop({
		targetNode
	}: {
		targetNode: Node | null;
		nodes: Node[];
		event: MouseEvent | TouchEvent;
	}) {
		if (targetNode) {
			updateNodePosition(pipelineId, targetNode);
		}
	}

	function onnodeclick({ node }: { event: MouseEvent | TouchEvent; node: Node }) {
		onNodeSelect?.(node.id);
	}

	function onpaneclick() {
		onNodeSelect?.(null);
	}

	function ondelete({ nodes: deletedNodes, edges: deletedEdges }: { nodes: Node[]; edges: Edge[] }) {
		for (const node of deletedNodes) {
			deleteNodeAction(pipelineId, node.id);
		}
		for (const edge of deletedEdges) {
			deleteEdgeAction(pipelineId, edge.id);
		}
	}
</script>

<div class="h-full w-full" data-testid="dag-canvas">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{onconnect}
		{onnodeclick}
		{onpaneclick}
		{onnodedragstop}
		{ondelete}
		fitView
	>
		<Background />
		<Controls />
		<MiniMap />
		{#if children}
			{@render children()}
		{/if}
	</SvelteFlow>
</div>
