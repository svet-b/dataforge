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

	let {
		pipelineId,
		activeTab = $bindable('results'),
	}: {
		pipelineId: string;
		activeTab: string;
	} = $props();

	let sortCol = $state<string | null>(null);
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(col: string) {
		if (sortCol === col) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortCol = col;
			sortDir = 'asc';
		}
	}

	let sortedData = $derived.by(() => {
		const data = $resultsStore.data;
		if (!sortCol || data.length === 0) return data;
		const col = sortCol;
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...data].sort((a, b) => {
			const av = a[col], bv = b[col];
			if (av == null && bv == null) return 0;
			if (av == null) return dir;
			if (bv == null) return -dir;
			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
			return String(av).localeCompare(String(bv)) * dir;
		});
	});

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

	function formatCell(value: unknown): string {
		if (value == null) return '';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
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
	<div class="flex-1 overflow-auto">
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
				<div class="sticky top-0 z-20 flex items-center gap-1.5 border-b border-gray-200 bg-white px-3 py-1.5">
					{#each $sourcePreviewStore.sources as src}
						<button
							class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors {$sourcePreviewStore.selectedSource === src.name
								? 'bg-blue-100 text-blue-700'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => selectSource(src.name)}
						>
							{src.name}
							<span class="ml-1 text-gray-400">{src.row_count}</span>
						</button>
					{/each}
					{#if $sourcePreviewStore.durationMs != null}
						<span class="ml-auto text-xs text-gray-400">{$sourcePreviewStore.durationMs}ms</span>
					{/if}
				</div>
				<!-- Source data table -->
				{#if selectedSourceData}
					{#if selectedSourceData.error}
						<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{selectedSourceData.error}</div>
					{:else}
						<table class="w-full border-collapse font-mono text-xs">
							<thead>
								<tr class="sticky top-[33px] z-10 bg-gray-50">
									{#each selectedSourceData.schema_info as col}
										<th class="border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold">
											<span class="text-gray-800">{col.name}</span>
											<span class="ml-1 text-gray-400">{col.type}</span>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each selectedSourceData.data as row, i}
									<tr class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
										{#each selectedSourceData.schema_info as col}
											<td class="border-r border-gray-100 px-2 py-1 text-gray-700">
												{formatCell(row[col.name])}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
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
				<div class="sticky top-0 z-20 flex items-center gap-1.5 border-b border-gray-200 bg-white px-3 py-1.5">
					{#each $cteInspectionStore.ctes as cte}
						<button
							class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors {$cteInspectionStore.selectedCte === cte.name
								? 'bg-blue-100 text-blue-700'
								: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
							onclick={() => selectCte(cte.name)}
						>
							{cte.name}
							<span class="ml-1 text-gray-400">{cte.row_count}</span>
						</button>
					{/each}
					{#if $cteInspectionStore.durationMs != null}
						<span class="ml-auto text-xs text-gray-400">{$cteInspectionStore.durationMs}ms</span>
					{/if}
				</div>
				<!-- CTE data table -->
				{#if selectedCteData}
					<table class="w-full border-collapse font-mono text-xs">
						<thead>
							<tr class="sticky top-[33px] z-10 bg-gray-50">
								{#each selectedCteData.schema_info as col}
									<th class="border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold">
										<span class="text-gray-800">{col.name}</span>
										<span class="ml-1 text-gray-400">{col.type}</span>
									</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each selectedCteData.data as row, i}
								<tr class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
									{#each selectedCteData.schema_info as col}
										<td class="border-r border-gray-100 px-2 py-1 text-gray-700">
											{formatCell(row[col.name])}
										</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			{/if}
		{:else if activeTab === 'results'}
			<!-- Results table -->
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
				<div class="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-3 py-1">
					<span class="text-xs text-gray-500">
						Showing {sortedData.length} of {$resultsStore.rowCount ?? sortedData.length} rows
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
				<table class="w-full border-collapse font-mono text-xs">
					<thead>
						<tr class="sticky top-[25px] z-10 bg-gray-50">
							{#each $resultsStore.schema as col}
								<th
									class="cursor-pointer border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold hover:bg-gray-100"
									onclick={() => toggleSort(col.name)}
								>
									<span class="text-gray-800">{col.name}</span>
									<span class="ml-1 text-gray-400">{col.type}</span>
									{#if sortCol === col.name}
										<span class="ml-0.5">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
									{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each sortedData as row, i}
							<tr class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
								{#each $resultsStore.schema as col}
									<td class="border-r border-gray-100 px-2 py-1 text-gray-700">
										{formatCell(row[col.name])}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
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
