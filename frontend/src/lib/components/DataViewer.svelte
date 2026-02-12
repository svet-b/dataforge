<script lang="ts">
	import type { SchemaColumn } from '$lib/types/index.js';
	import DataTable from './DataTable.svelte';
	import ResultsChart from './ResultsChart.svelte';

	let {
		data,
		schema,
	}: {
		data: Record<string, unknown>[];
		schema: SchemaColumn[];
	} = $props();

	// --- Vertical split divider ---
	let splitPercent = $state(55);
	let isDraggingSplit = $state(false);
	let splitContainerEl: HTMLDivElement | undefined = $state();

	function onSplitMouseDown(e: MouseEvent) {
		e.preventDefault();
		isDraggingSplit = true;

		function onMouseMove(e: MouseEvent) {
			if (!splitContainerEl) return;
			const rect = splitContainerEl.getBoundingClientRect();
			const pct = ((e.clientY - rect.top) / rect.height) * 100;
			splitPercent = Math.max(15, Math.min(85, pct));
		}

		function onMouseUp() {
			isDraggingSplit = false;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
		}

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}
</script>

<div
	class="flex min-h-0 flex-1 flex-col"
	bind:this={splitContainerEl}
	class:select-none={isDraggingSplit}
>
	<!-- Top: Data table -->
	<div class="flex flex-col overflow-hidden" style="height: {splitPercent}%;">
		<div class="min-h-0 flex-1">
			<DataTable {data} {schema} />
		</div>
	</div>

	<!-- Drag handle -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-gray-200 bg-gray-100 hover:bg-gray-200 transition-colors"
		onmousedown={onSplitMouseDown}
		role="separator"
	>
		<div class="h-0.5 w-8 rounded-full bg-gray-400"></div>
	</div>

	<!-- Bottom: Chart -->
	<div class="flex flex-col overflow-hidden" style="height: {100 - splitPercent}%;">
		<ResultsChart {data} {schema} />
	</div>
</div>
