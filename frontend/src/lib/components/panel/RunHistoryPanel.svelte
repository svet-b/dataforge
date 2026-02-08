<script lang="ts">
	import { onMount } from 'svelte';
	import { runsStore, loadRuns, loadRunDetail } from '$lib/stores/runs.js';

	let { pipelineId }: { pipelineId: string } = $props();

	let expandedRunId = $state<string | null>(null);

	onMount(() => {
		loadRuns(pipelineId);
	});

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
</script>

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
							<div class="mb-2 rounded bg-red-50 p-2 text-red-600">
								{$runsStore.expandedRun.error}
							</div>
						{/if}

						{#if Object.keys($runsStore.expandedRun.parameters ?? {}).length > 0}
							<div class="mb-2">
								<span class="font-semibold text-gray-600">Parameters:</span>
								<pre class="mt-0.5 rounded bg-white p-1.5 text-gray-700">{JSON.stringify($runsStore.expandedRun.parameters, null, 2)}</pre>
							</div>
						{/if}

						{#if Object.keys($runsStore.expandedRun.node_timings ?? {}).length > 0}
							<div class="mb-2">
								<span class="font-semibold text-gray-600">Node Timings:</span>
								<table class="mt-1 w-full text-left">
									<thead><tr><th class="pb-0.5 text-gray-500">Node</th><th class="pb-0.5 text-gray-500">Duration</th></tr></thead>
									<tbody>
										{#each Object.entries($runsStore.expandedRun.node_timings) as [node, ms]}
											<tr><td class="py-0.5 text-gray-700">{node}</td><td class="py-0.5 text-gray-700">{ms}ms</td></tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if $runsStore.expandedRun.output_preview && $runsStore.expandedRun.output_preview.length > 0}
							<div>
								<span class="font-semibold text-gray-600">Output Preview:</span>
								<div class="mt-1 max-h-32 overflow-auto rounded border border-gray-200 bg-white">
									<table class="w-full border-collapse font-mono">
										<thead>
											<tr>
												{#each Object.keys($runsStore.expandedRun.output_preview[0]) as col}
													<th class="border-b border-gray-200 px-2 py-1 text-left text-gray-600">{col}</th>
												{/each}
											</tr>
										</thead>
										<tbody>
											{#each $runsStore.expandedRun.output_preview as row}
												<tr>
													{#each Object.values(row) as val}
														<td class="border-b border-gray-50 px-2 py-0.5 text-gray-700">{val ?? ''}</td>
													{/each}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}
