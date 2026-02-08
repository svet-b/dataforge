<script lang="ts">
	import type { NodeStatus } from '$lib/types/index.js';

	let { status }: { status: NodeStatus } = $props();
</script>

{#if status === 'success'}
	<span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-100 text-green-600">
		<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
			<polyline points="20 6 9 17 4 12" />
		</svg>
	</span>
{:else if status === 'error'}
	<span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-100 text-red-600">
		<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
			<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
		</svg>
	</span>
{:else if status === 'running'}
	<span class="inline-flex h-3.5 w-3.5 items-center justify-center">
		<span class="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
	</span>
{:else if status === 'stale'}
	<span class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
		<svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
			<polyline points="20 6 9 17 4 12" />
		</svg>
	</span>
{/if}
