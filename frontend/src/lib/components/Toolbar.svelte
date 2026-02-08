<script lang="ts">
	import { updatePipelineName } from '$lib/stores/pipeline.js';

	let {
		pipelineId,
		pipelineName,
		onOpenParams,
		onOpenRun
	}: {
		pipelineId: string;
		pipelineName: string;
		onOpenParams: () => void;
		onOpenRun: () => void;
	} = $props();

	let editing = $state(false);
	let editValue = $state('');

	function autoFocus(node: HTMLElement) {
		node.focus();
	}

	function startEdit() {
		editValue = pipelineName;
		editing = true;
	}

	function saveName() {
		editing = false;
		if (editValue.trim() && editValue !== pipelineName) {
			updatePipelineName(pipelineId, editValue.trim());
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') saveName();
		if (e.key === 'Escape') editing = false;
	}
</script>

<div class="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2" data-testid="toolbar">
	<a href="/" class="text-gray-500 hover:text-gray-700" aria-label="Back to pipelines">
		<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M19 12H5M12 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</a>

	<div class="flex-1">
		{#if editing}
			<input
				data-testid="pipeline-name-input"
				class="rounded border border-gray-300 px-2 py-1 text-sm font-semibold focus:border-blue-500 focus:outline-none"
				bind:value={editValue}
				{onkeydown}
				onblur={saveName}
				use:autoFocus
			/>
		{:else}
			<button
				data-testid="pipeline-name"
				class="text-sm font-semibold text-gray-800 hover:text-blue-600"
				onclick={startEdit}
			>
				{pipelineName}
			</button>
		{/if}
	</div>

	<button
		class="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
		onclick={onOpenParams}
	>
		Parameters
	</button>

	<button
		class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-blue-700"
		onclick={onOpenRun}
	>
		Run
	</button>
</div>
