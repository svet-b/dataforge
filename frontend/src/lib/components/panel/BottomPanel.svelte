<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		panelHeight = $bindable(0),
		activeTab = $bindable('config'),
		tabs,
		children
	}: {
		panelHeight: number;
		activeTab: string;
		tabs: { id: string; label: string }[];
		children: Snippet;
	} = $props();

	let dragging = $state(false);
	let startY = 0;
	let startHeight = 0;

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		startY = e.clientY;
		startHeight = panelHeight;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const delta = startY - e.clientY;
		panelHeight = Math.max(100, Math.min(600, startHeight + delta));
	}

	function onPointerUp() {
		dragging = false;
	}
</script>

{#if panelHeight > 0}
	<div class="flex flex-col border-t border-gray-200 bg-white" data-testid="bottom-panel" style="height: {panelHeight}px;">
		<!-- Resize handle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex h-1.5 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-200"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
		>
			<div class="h-0.5 w-8 rounded-full bg-gray-400"></div>
		</div>

		<!-- Tab bar -->
		<div class="flex gap-0 border-b border-gray-200 px-2">
			{#each tabs as tab}
				<button
					data-testid="tab-{tab.id}"
					class="px-3 py-1.5 text-xs font-medium transition-colors {activeTab === tab.id
						? 'border-b-2 border-blue-500 text-blue-600'
						: 'text-gray-500 hover:text-gray-700'}"
					onclick={() => (activeTab = tab.id)}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-auto">
			{@render children()}
		</div>
	</div>
{/if}
