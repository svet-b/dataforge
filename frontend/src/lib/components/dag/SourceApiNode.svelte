<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';

	let { data }: NodeProps = $props();
</script>

<div class="min-w-[160px] rounded-lg border border-blue-300 bg-white shadow-md">
	<div class="flex items-center gap-1.5 rounded-t-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white">
		<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12s4.48 10 10 10" stroke-linecap="round" />
			<path d="M13 2.05A10 10 0 0 1 22 12" stroke-linecap="round" />
			<path d="M2 12h20" stroke-linecap="round" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
		API Source
	</div>
	<div class="px-3 py-2">
		<div class="text-sm font-medium text-gray-800">{data.label}</div>
		<div class="text-xs text-gray-500">{data.outputTableName}</div>
	</div>
	<Handle type="source" position={Position.Right} class="!bg-blue-500" />
</div>
