<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import {
		pipelineStore,
		loadPipeline,
		resetPipelineStore,
	} from '$lib/stores/pipeline.js';
	import { resetRunsStore } from '$lib/stores/runs.js';
	import { clearPreview } from '$lib/stores/preview.js';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import SourceList from '$lib/components/SourceList.svelte';
	import SourceConfigPanel from '$lib/components/SourceConfigPanel.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';
	import ResultsPanel from '$lib/components/ResultsPanel.svelte';
	import ParameterModal from '$lib/components/ParameterModal.svelte';
	import RunDialog from '$lib/components/RunDialog.svelte';

	const pipelineId = page.params.id!;

	let showParamModal = $state(false);
	let showRunDialog = $state(false);
	let resultsTab = $state('results');

	// Resizable bottom panel
	let bottomHeight = $state(250);
	let dragging = $state(false);
	let startY = 0;
	let startHeight = 0;

	function onPointerDown(e: PointerEvent) {
		dragging = true;
		startY = e.clientY;
		startHeight = bottomHeight;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const delta = startY - e.clientY;
		bottomHeight = Math.max(80, Math.min(600, startHeight + delta));
	}

	function onPointerUp() {
		dragging = false;
	}

	let selectedSource = $derived(
		$pipelineStore.pipeline?.sources.find(
			(s) => s.id === $pipelineStore.selectedSourceId
		) ?? null
	);

	onMount(() => {
		loadPipeline(pipelineId);
	});

	onDestroy(() => {
		resetPipelineStore();
		resetRunsStore();
		clearPreview();
	});

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $pipelineStore.loading}
	<div class="flex h-screen items-center justify-center text-gray-500">Loading pipeline...</div>
{:else if $pipelineStore.error}
	<div class="flex h-screen items-center justify-center text-red-500">
		Error: {$pipelineStore.error}
	</div>
{:else if $pipelineStore.pipeline}
	<div class="flex h-screen flex-col" data-testid="pipeline-editor">
		<!-- Toolbar -->
		<Toolbar
			{pipelineId}
			pipelineName={$pipelineStore.pipeline.name}
			onOpenParams={() => (showParamModal = true)}
			onOpenRun={() => (showRunDialog = true)}
		/>

		<!-- Main content: inputs + query editor -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Left sidebar: source list + config -->
			<div class="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
				<div class="flex-1 overflow-y-auto">
					<SourceList {pipelineId} />
					{#if selectedSource}
						<SourceConfigPanel {pipelineId} source={selectedSource} />
					{/if}
				</div>
			</div>

			<!-- Center: SQL query editor -->
			<div class="flex flex-1 flex-col overflow-hidden bg-white">
				<QueryEditor {pipelineId} />
			</div>
		</div>

		<!-- Bottom: results panel with resize handle -->
		<div class="flex flex-col border-t border-gray-200 bg-white" style="height: {bottomHeight}px;">
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
			<div class="flex-1 overflow-hidden">
				<ResultsPanel {pipelineId} bind:activeTab={resultsTab} />
			</div>
		</div>
	</div>

	{#if showParamModal}
		<ParameterModal
			{pipelineId}
			parameters={$pipelineStore.pipeline.parameters ?? []}
			onClose={() => (showParamModal = false)}
		/>
	{/if}

	{#if showRunDialog}
		<RunDialog
			{pipelineId}
			parameters={$pipelineStore.pipeline.parameters ?? []}
			onClose={() => (showRunDialog = false)}
			onRunComplete={() => {
				resultsTab = 'history';
			}}
		/>
	{/if}
{/if}
