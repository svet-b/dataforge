<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import {
		pipelineStore,
		loadPipeline,
		resetPipelineStore,
		selectNode
	} from '$lib/stores/pipeline.js';
	import { resetRunsStore } from '$lib/stores/runs.js';
	import { clearNodeStatuses } from '$lib/stores/nodeStatus.js';
	import { clearPreview } from '$lib/stores/preview.js';
	import DagCanvas from '$lib/components/dag/DagCanvas.svelte';
	import NodePalette from '$lib/components/NodePalette.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import BottomPanel from '$lib/components/panel/BottomPanel.svelte';
	import NodeConfigPanel from '$lib/components/panel/NodeConfigPanel.svelte';
	import DataPreviewTable from '$lib/components/panel/DataPreviewTable.svelte';
	import RunHistoryPanel from '$lib/components/panel/RunHistoryPanel.svelte';
	import ParameterModal from '$lib/components/ParameterModal.svelte';
	import RunDialog from '$lib/components/RunDialog.svelte';

	const pipelineId = page.params.id!;

	let nodes = $state($pipelineStore.nodes);
	let edges = $state($pipelineStore.edges);

	let panelHeight = $state(0);
	let activeTab = $state('config');
	let showParamModal = $state(false);
	let showRunDialog = $state(false);

	const tabs = [
		{ id: 'config', label: 'Config' },
		{ id: 'preview', label: 'Preview' },
		{ id: 'history', label: 'Run History' }
	];

	onMount(() => {
		loadPipeline(pipelineId);
	});

	onDestroy(() => {
		resetPipelineStore();
		resetRunsStore();
		clearNodeStatuses();
		clearPreview();
	});

	$effect(() => {
		nodes = $pipelineStore.nodes;
		edges = $pipelineStore.edges;
	});

	function handleNodeSelect(nodeId: string | null) {
		selectNode(nodeId);
		if (nodeId) {
			activeTab = 'config';
			if (panelHeight === 0) panelHeight = 280;
		}
	}

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
		<Toolbar
			{pipelineId}
			pipelineName={$pipelineStore.pipeline.name}
			onOpenParams={() => (showParamModal = true)}
			onOpenRun={() => (showRunDialog = true)}
		/>
		<div class="flex-1 overflow-hidden">
			<DagCanvas {pipelineId} bind:nodes bind:edges onNodeSelect={handleNodeSelect}>
				<NodePalette {pipelineId} />
			</DagCanvas>
		</div>
		<BottomPanel bind:panelHeight bind:activeTab {tabs}>
			{#if activeTab === 'config'}
				<NodeConfigPanel {pipelineId} />
			{:else if activeTab === 'preview'}
				<DataPreviewTable />
			{:else if activeTab === 'history'}
				<RunHistoryPanel {pipelineId} />
			{/if}
		</BottomPanel>
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
				activeTab = 'history';
				if (panelHeight === 0) panelHeight = 280;
			}}
		/>
	{/if}
{/if}
