<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';
	import { nodeStatusStore } from '$lib/stores/nodeStatus.js';
	import NodeStatusIndicator from './NodeStatusIndicator.svelte';

	let { id, data }: NodeProps = $props();
	let status = $derived($nodeStatusStore[id] ?? 'idle');
</script>

<div class="min-w-[160px] rounded-lg border bg-white shadow-md {status === 'error' ? 'border-2 border-red-400' : 'border-green-300'} {status === 'running' ? 'animate-pulse' : ''} {status === 'stale' ? 'opacity-60' : ''}">
	<div class="flex items-center gap-1.5 rounded-t-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white">
		<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
		</svg>
		File Source
		{#if status !== 'idle'}
			<NodeStatusIndicator {status} />
		{/if}
	</div>
	<div class="px-3 py-2">
		<div class="text-sm font-medium text-gray-800">{data.label}</div>
		<div class="text-xs text-gray-500">{data.outputTableName}</div>
	</div>
	<Handle type="source" position={Position.Right} class="!bg-green-500" />
</div>
