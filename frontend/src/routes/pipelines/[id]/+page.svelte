<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import {
		pipelineStore,
		loadPipeline,
		resetPipelineStore,
		runPipeline,
	} from '$lib/stores/pipeline.js';
	import { resetRunsStore, loadRuns } from '$lib/stores/runs.js';
	import {
		clearResults,
		setResultsLoading,
		setResults,
		setResultsError,
	} from '$lib/stores/results.js';
	import { resetCteInspection } from '$lib/stores/cteInspection.js';
	import { resetSourcePreview } from '$lib/stores/sourcePreview.js';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import SourceList from '$lib/components/SourceList.svelte';
	import SourceConfigPanel from '$lib/components/SourceConfigPanel.svelte';
	import QueryEditor from '$lib/components/QueryEditor.svelte';
	import ResultsPanel from '$lib/components/ResultsPanel.svelte';
	import ParameterModal from '$lib/components/ParameterModal.svelte';
	import RunDialog from '$lib/components/RunDialog.svelte';
	import LlmChat from '$lib/components/LlmChat.svelte';

	const pipelineId = page.params.id!;

	let showParamModal = $state(false);
	let showRunDialog = $state(false);
	let resultsTab = $state('results');

	// --- Resizable panel state ---
	// Column widths (pixels)
	let leftColWidth = $state(280);   // AI Chat
	let rightColWidth = $state(420);  // Results
	// Middle column vertical split (pixels from top for sources pane)
	let sourcesHeight = $state(220);

	// Drag state
	type DragTarget = 'left-divider' | 'right-divider' | 'middle-divider' | null;
	let dragTarget: DragTarget = $state(null);
	let dragStartPos = 0;
	let dragStartSize = 0;

	function onDividerPointerDown(target: DragTarget, e: PointerEvent) {
		dragTarget = target;
		dragStartPos = target === 'middle-divider' ? e.clientY : e.clientX;
		dragStartSize = target === 'left-divider' ? leftColWidth
			: target === 'right-divider' ? rightColWidth
			: sourcesHeight;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onDividerPointerMove(e: PointerEvent) {
		if (!dragTarget) return;
		if (dragTarget === 'left-divider') {
			const delta = e.clientX - dragStartPos;
			leftColWidth = Math.max(180, Math.min(480, dragStartSize + delta));
		} else if (dragTarget === 'right-divider') {
			// Right column grows when mouse moves left
			const delta = dragStartPos - e.clientX;
			rightColWidth = Math.max(200, Math.min(700, dragStartSize + delta));
		} else if (dragTarget === 'middle-divider') {
			const delta = e.clientY - dragStartPos;
			sourcesHeight = Math.max(80, Math.min(500, dragStartSize + delta));
		}
	}

	function onDividerPointerUp() {
		dragTarget = null;
	}

	let queryEditor: QueryEditor | undefined = $state();

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
		clearResults();
		resetCteInspection();
		resetSourcePreview();
	});

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
		}
	}

	function handleRun() {
		const params = $pipelineStore.pipeline?.parameters ?? [];
		if (params.length > 0) {
			showRunDialog = true;
		} else {
			executeRun();
		}
	}

	async function executeRun() {
		setResultsLoading();
		resultsTab = 'results';
		const result = await runPipeline(pipelineId);
		if (result) {
			setResults(result);
		} else {
			setResultsError('Run failed');
		}
		await loadRuns(pipelineId);
	}

	function handleSqlGenerated(sql: string) {
		queryEditor?.setSql(sql);
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
			onRun={handleRun}
		/>

		<!-- Main content: three-column layout (AI Chat | Sources+SQL | Results) -->
		<div class="flex flex-1 overflow-hidden" class:select-none={dragTarget !== null}>
			<!-- Left column: AI Chat -->
			<div class="flex shrink-0 flex-col bg-white" style="width: {leftColWidth}px;">
				<LlmChat {pipelineId} onSqlGenerated={handleSqlGenerated} />
			</div>

			<!-- Left divider (between AI Chat and middle) -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
				onpointerdown={(e) => onDividerPointerDown('left-divider', e)}
				onpointermove={onDividerPointerMove}
				onpointerup={onDividerPointerUp}
			>
				<div class="h-8 w-0.5 rounded-full bg-gray-400"></div>
			</div>

			<!-- Middle column: Sources (top) + SQL Editor (bottom) -->
			<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
				<!-- Sources pane (top) -->
				<div class="shrink-0 overflow-y-auto bg-white" style="height: {sourcesHeight}px;">
					<SourceList {pipelineId} />
					{#if selectedSource}
						<SourceConfigPanel {pipelineId} source={selectedSource} />
					{/if}
				</div>

				<!-- Middle divider (between sources and SQL editor) -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
					onpointerdown={(e) => onDividerPointerDown('middle-divider', e)}
					onpointermove={onDividerPointerMove}
					onpointerup={onDividerPointerUp}
				>
					<div class="h-0.5 w-8 rounded-full bg-gray-400"></div>
				</div>

				<!-- SQL Editor pane (bottom) -->
				<div class="flex flex-1 flex-col overflow-hidden bg-white">
					<QueryEditor
						bind:this={queryEditor}
						{pipelineId}
						onRun={handleRun}
					/>
				</div>
			</div>

			<!-- Right divider (between middle and Results) -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-gray-100 hover:bg-gray-300"
				onpointerdown={(e) => onDividerPointerDown('right-divider', e)}
				onpointermove={onDividerPointerMove}
				onpointerup={onDividerPointerUp}
			>
				<div class="h-8 w-0.5 rounded-full bg-gray-400"></div>
			</div>

			<!-- Right column: Results -->
			<div class="flex shrink-0 flex-col bg-white" style="width: {rightColWidth}px;">
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
				resultsTab = 'results';
			}}
		/>
	{/if}
{/if}
