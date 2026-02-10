<script lang="ts">
	import type { PipelineParameter } from '$lib/types/index.js';
	import { runPipeline } from '$lib/stores/pipeline.js';
	import { loadRuns } from '$lib/stores/runs.js';
	import { setResults, setResultsError } from '$lib/stores/results.js';

	let {
		pipelineId,
		parameters,
		onClose,
		onRunComplete,
	}: {
		pipelineId: string;
		parameters: PipelineParameter[];
		onClose: () => void;
		onRunComplete: () => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let values = $state<Record<string, string>>(
		Object.fromEntries(parameters.map((p) => [p.name, (p.default as string) ?? '']))
	);
	let running = $state(false);

	async function handleRun() {
		running = true;
		const params: Record<string, unknown> = {};
		for (const p of parameters) {
			const val = values[p.name];
			if (p.type === 'number') params[p.name] = Number(val) || 0;
			else if (p.type === 'boolean') params[p.name] = val === 'true';
			else params[p.name] = val;
		}
		try {
			const result = await runPipeline(pipelineId, params);
			if (result) {
				setResults(result);
			} else {
				setResultsError('Run failed');
			}
			await loadRuns(pipelineId);
			onRunComplete();
			onClose();
		} finally {
			running = false;
		}
	}

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
	onclick={onBackdropClick}
>
	<div class="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" data-testid="run-dialog">
		<h2 class="mb-4 text-lg font-semibold text-gray-800">Run Pipeline</h2>

		{#if parameters.length > 0}
			<div class="mb-4 space-y-3">
				{#each parameters as param}
					<div>
						<label for="run-param-{param.name}" class="mb-1 block text-sm font-medium text-gray-700">
							{param.name}
							{#if param.description}
								<span class="ml-1 font-normal text-gray-400">- {param.description}</span>
							{/if}
						</label>
						{#if param.type === 'boolean'}
							<select
								id="run-param-{param.name}"
								class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
								bind:value={values[param.name]}
							>
								<option value="true">true</option>
								<option value="false">false</option>
							</select>
						{:else}
							<input
								id="run-param-{param.name}"
								class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
								type={param.type === 'number' ? 'number' : 'text'}
								bind:value={values[param.name]}
							/>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="mb-4 text-sm text-gray-500">No parameters configured. Run with defaults?</p>
		{/if}

		<div class="flex justify-end gap-2">
			<button
				class="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
				onclick={onClose}
				disabled={running}
			>
				Cancel
			</button>
			<button
				data-testid="run-execute-btn"
				class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
				onclick={handleRun}
				disabled={running}
			>
				{running ? 'Running...' : 'Run'}
			</button>
		</div>
	</div>
</div>
