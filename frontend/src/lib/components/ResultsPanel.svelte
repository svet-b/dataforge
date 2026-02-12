<script lang="ts">
	import { resultsStore } from '$lib/stores/results.js';
	import { runsStore, loadRuns, loadRunDetail } from '$lib/stores/runs.js';
	import {
		cteInspectionStore,
		loadCteInspection,
		selectCte,
	} from '$lib/stores/cteInspection.js';
	import {
		sourcePreviewStore,
		loadSourcePreview,
		selectSource,
	} from '$lib/stores/sourcePreview.js';
	import { api } from '$lib/api/client.js';
	import DataViewer from './DataViewer.svelte';

	let {
		pipelineId,
		activeTab = $bindable('results'),
	}: {
		pipelineId: string;
		activeTab: string;
	} = $props();

	// Run history
	let expandedRunId = $state<string | null>(null);

	function toggleExpand(runId: string) {
		if (expandedRunId === runId) {
			expandedRunId = null;
		} else {
			expandedRunId = runId;
			loadRunDetail(pipelineId, runId);
		}
	}

	function formatTime(iso: string): string {
		return new Date(iso).toLocaleString();
	}

	function downloadUrl(runId: string, format: 'csv' | 'json'): string {
		return api.download.url(pipelineId, runId, format);
	}

	// Source preview: selected source data
	let selectedSourceData = $derived(
		$sourcePreviewStore.sources.find((s) => s.name === $sourcePreviewStore.selectedSource) ?? null
	);

	// CTE inspection: selected CTE data
	let selectedCteData = $derived(
		$cteInspectionStore.ctes.find((c) => c.name === $cteInspectionStore.selectedCte) ?? null
	);

	// Cache is stale when the runId has changed since last CTE fetch
	let cteStale = $derived(
		$resultsStore.runId !== $cteInspectionStore.cachedForRunId
	);

	$effect(() => {
		if (activeTab === 'history') {
			loadRuns(pipelineId);
		}
		if (activeTab === 'inputs' && !$sourcePreviewStore.cached && !$sourcePreviewStore.loading) {
			loadSourcePreview(pipelineId);
		}
		if (activeTab === 'ctes' && cteStale && !$cteInspectionStore.loading) {
			loadCteInspection(pipelineId, $resultsStore.runId);
		}
	});
</script>

<div class="flex h-full flex-col">
	<!-- Tab bar -->
	<div class="flex gap-0 border-b border-gray-200 px-2">
		<button
			data-testid="tab-inputs"
			class="px-3 py-1.5 text-xs font-medium transition-colors {activeTab === 'inputs'
				? 'border-b-2 border-blue-500 text-blue-600'
				: 'text-gray-500 hover:text-gray-700'}"
			onclick={() => (activeTab = 'inputs')}
		>
			Inputs
		</button>
		<button
			data-testid="tab-ctes"
			class="px-3 py-1.5 text-xs font-medium transition-colors {activeTab === 'ctes'
				? 'border-b-2 border-blue-500 text-blue-600'
				: 'text-gray-500 hover:text-gray-700'}"
			onclick={() => (activeTab = 'ctes')}
		>
			Intermediate CTEs
		</button>
		<button
			data-testid="tab-results"
			class="px-3 py-1.5 text-xs font-medium transition-colors {activeTab === 'results'
				? 'border-b-2 border-blue-500 text-blue-600'
				: 'text-gray-500 hover:text-gray-700'}"
			onclick={() => (activeTab = 'results')}
		>
			Results
		</button>
		<button
			data-testid="tab-history"
			class="ml-auto px-3 py-1.5 text-xs font-medium transition-colors {activeTab === 'history'
				? 'border-b-2 border-blue-500 text-blue-600'
				: 'text-gray-500 hover:text-gray-700'}"
			onclick={() => (activeTab = 'history')}
		>
			Run History
		</button>
	</div>

	<!-- Content -->
	<div class="flex flex-1 flex-col overflow-hidden {activeTab === 'history' ? 'overflow-y-auto' : ''}">
		{#if activeTab === 'inputs'}
			<!-- Source Inputs -->
			{#if $sourcePreviewStore.loading}
				<div class="flex h-full items-center justify-center text-sm text-gray-500">
					<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" class="opacity-25" />
						<path d="M4 12a8 8 0 0 1 8-8" class="opacity-75" stroke-linecap="round" />
					</svg>
					Loading sources...
				</div>
			{:else if $sourcePreviewStore.error}
				<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{$sourcePreviewStore.error}</div>
			{:else if $sourcePreviewStore.sources.length === 0}
				<div class="flex h-full items-center justify-center text-sm text-gray-400">
					No sources configured.
				</div>
			{:else}
				<!-- Source selector pills -->
				<div class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
					{#each $sourcePreviewStore.sources as src}
						<button
							class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors {$sourcePreviewStore.selectedSource === src.name
								? 'bg-blue-100 text-blue-700'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => selectSource(src.name)}
						>
							{src.name}
							<span class="ml-1 text-gray-400">{src.row_count}</span>
						</button>
					{/each}
					{#if $sourcePreviewStore.durationMs != null}
						<span class="ml-auto shrink-0 text-xs text-gray-400">{$sourcePreviewStore.durationMs}ms</span>
					{/if}
				</div>
				<!-- Source data viewer -->
				{#if selectedSourceData}
					{#if selectedSourceData.error}
						<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{selectedSourceData.error}</div>
					{:else}
						{#key $sourcePreviewStore.selectedSource}
							<DataViewer data={selectedSourceData.data} schema={selectedSourceData.schema_info} />
						{/key}
					{/if}
				{/if}
			{/if}
		{:else if activeTab === 'ctes'}
			<!-- CTE Inspection -->
			{#if $cteInspectionStore.loading}
				<div class="flex h-full items-center justify-center text-sm text-gray-500">
					<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" class="opacity-25" />
						<path d="M4 12a8 8 0 0 1 8-8" class="opacity-75" stroke-linecap="round" />
					</svg>
					Inspecting CTEs...
				</div>
			{:else if $cteInspectionStore.error}
				<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{$cteInspectionStore.error}</div>
			{:else if $cteInspectionStore.ctes.length === 0}
				<div class="flex h-full items-center justify-center text-sm text-gray-400">
					No CTEs found in the query.
				</div>
			{:else}
				<!-- CTE selector pills -->
				<div class="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-200 bg-white px-3 py-1.5">
					{#each $cteInspectionStore.ctes as cte}
						<button
							class="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors {$cteInspectionStore.selectedCte === cte.name
								? 'bg-blue-100 text-blue-700'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => selectCte(cte.name)}
						>
							{cte.name}
							<span class="ml-1 text-gray-400">{cte.row_count}</span>
						</button>
					{/each}
					{#if $cteInspectionStore.durationMs != null}
						<span class="ml-auto shrink-0 text-xs text-gray-400">{$cteInspectionStore.durationMs}ms</span>
					{/if}
				</div>
				<!-- CTE data viewer -->
				{#if selectedCteData}
					{#key $cteInspectionStore.selectedCte}
						<DataViewer data={selectedCteData.data} schema={selectedCteData.schema_info} />
					{/key}
				{/if}
			{/if}
		{:else if activeTab === 'results'}
			<!-- Results -->
			{#if $resultsStore.loading}
				<div class="flex h-full items-center justify-center text-sm text-gray-500">
					<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="10" class="opacity-25" />
						<path d="M4 12a8 8 0 0 1 8-8" class="opacity-75" stroke-linecap="round" />
					</svg>
					Running query...
				</div>
			{:else if $resultsStore.error}
				<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{$resultsStore.error}</div>
			{:else if $resultsStore.data.length === 0}
				<div class="flex h-full items-center justify-center text-sm text-gray-400">
					No results yet. Click Run to execute the pipeline.
				</div>
			{:else}
				<!-- Results header bar -->
				<div class="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 py-1">
					<span class="text-xs text-gray-500">
						Showing {$resultsStore.data.length} of {$resultsStore.rowCount ?? $resultsStore.data.length} rows
						{#if $resultsStore.durationMs != null}
							&middot; {$resultsStore.durationMs}ms
						{/if}
					</span>
					{#if $resultsStore.runId}
						<div class="flex gap-1.5" data-testid="download-buttons">
							<a
								href={downloadUrl($resultsStore.runId, 'csv')}
								class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
								download
							>
								CSV
							</a>
							<a
								href={downloadUrl($resultsStore.runId, 'json')}
								class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
								download
							>
								JSON
							</a>
						</div>
					{/if}
				</div>
				<DataViewer data={$resultsStore.data} schema={$resultsStore.schema} />
			{/if}
		{:else if activeTab === 'history'}
			<!-- Run History -->
			{#if $runsStore.loading}
				<div class="flex h-full items-center justify-center text-sm text-gray-500">Loading runs...</div>
			{:else if $runsStore.runs.length === 0}
				<div class="flex h-full items-center justify-center text-sm text-gray-400">
					No runs yet. Click Run to execute the pipeline.
				</div>
			{:else}
				<div class="divide-y divide-gray-100">
					{#each $runsStore.runs as run}
						<div>
							<button
								class="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
								onclick={() => toggleExpand(run.id)}
							>
								<span
									class="inline-block h-2 w-2 shrink-0 rounded-full {run.status === 'success'
										? 'bg-green-500'
										: 'bg-red-500'}"
								></span>
								<span class="flex-1 text-gray-700">{formatTime(run.started_at)}</span>
								<span class="text-xs text-gray-500">{run.duration_ms}ms</span>
								{#if run.row_count != null}
									<span class="text-xs text-gray-500">{run.row_count} rows</span>
								{/if}
								<svg
									class="h-3.5 w-3.5 text-gray-400 transition-transform {expandedRunId === run.id
										? 'rotate-180'
										: ''}"
									viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</button>

							{#if expandedRunId === run.id && $runsStore.expandedRun}
								<div class="border-t border-gray-100 bg-gray-50/50 px-4 py-3 text-xs">
									{#if $runsStore.expandedRun.error}
										<div class="mb-2 space-y-1 rounded bg-red-50 p-2 text-red-600">
											<div>{$runsStore.expandedRun.error.message}</div>
											{#if $runsStore.expandedRun.error.sql}
												<pre class="mt-1 whitespace-pre-wrap rounded bg-red-100/50 p-1.5 font-mono text-red-700">{$runsStore.expandedRun.error.sql}</pre>
											{/if}
										</div>
									{/if}

									{#if Object.keys($runsStore.expandedRun.parameters ?? {}).length > 0}
										<div class="mb-2">
											<span class="font-semibold text-gray-600">Parameters:</span>
											<pre class="mt-0.5 rounded bg-white p-1.5 text-gray-700">{JSON.stringify($runsStore.expandedRun.parameters, null, 2)}</pre>
										</div>
									{/if}

									<!-- Download buttons -->
									{#if run.status === 'success'}
										<div class="flex gap-2">
											<a
												href={downloadUrl(run.id, 'csv')}
												class="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
												download
											>
												Download CSV
											</a>
											<a
												href={downloadUrl(run.id, 'json')}
												class="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
												download
											>
												Download JSON
											</a>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
