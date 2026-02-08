<script lang="ts">
	import { updateNodeConfig } from '$lib/stores/pipeline.js';
	import { runPreview } from '$lib/stores/preview.js';
	import { debounce } from '$lib/utils/debounce.js';
	import KeyValueEditor from './KeyValueEditor.svelte';

	let {
		pipelineId,
		nodeId,
		config,
		outputTableName
	}: {
		pipelineId: string;
		nodeId: string;
		config: Record<string, unknown>;
		outputTableName: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	let url = $state((config.url as string) ?? '');
	// svelte-ignore state_referenced_locally
	let method = $state((config.method as string) ?? 'GET');
	// svelte-ignore state_referenced_locally
	let headers = $state<{ key: string; value: string }[]>(
		Array.isArray(config.headers)
			? (config.headers as { key: string; value: string }[])
			: []
	);
	// svelte-ignore state_referenced_locally
	let body = $state((config.body as string) ?? '');
	// svelte-ignore state_referenced_locally
	let responsePath = $state((config.response_path as string) ?? '');
	let tableName = $state(outputTableName);

	const saveConfig = debounce(() => {
		updateNodeConfig(pipelineId, nodeId, {
			config: {
				url,
				method,
				headers: headers.filter((h) => h.key),
				body: method === 'POST' ? body : undefined,
				response_path: responsePath || undefined
			},
			output_table_name: tableName || undefined
		});
	}, 500);

	function onchange() {
		saveConfig();
	}

	function testConnection() {
		saveConfig.cancel();
		updateNodeConfig(pipelineId, nodeId, {
			config: {
				url,
				method,
				headers: headers.filter((h) => h.key),
				body: method === 'POST' ? body : undefined,
				response_path: responsePath || undefined
			},
			output_table_name: tableName || undefined
		}).then(() => {
			runPreview(pipelineId, nodeId);
		});
	}
</script>

<div class="space-y-3 p-3">
	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">URL</label>
		<input
			class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
			bind:value={url}
			oninput={onchange}
			placeholder="https://api.example.com/data"
		/>
	</div>

	<div class="flex gap-3">
		<div class="w-28">
			<label class="mb-1 block text-xs font-medium text-gray-600">Method</label>
			<select
				class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
				bind:value={method}
				onchange={onchange}
			>
				<option value="GET">GET</option>
				<option value="POST">POST</option>
			</select>
		</div>

		<div class="flex-1">
			<label class="mb-1 block text-xs font-medium text-gray-600">Output Table</label>
			<input
				class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
				bind:value={tableName}
				oninput={onchange}
				placeholder="api_data"
			/>
		</div>
	</div>

	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Headers</label>
		<KeyValueEditor bind:entries={headers} keyPlaceholder="Header name" valuePlaceholder="Header value" />
	</div>

	{#if method === 'POST'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Body</label>
			<textarea
				class="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none"
				rows="3"
				bind:value={body}
				oninput={onchange}
				placeholder={'{"key": "value"}'}
			></textarea>
		</div>
	{/if}

	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Response Path (JSONPath)</label>
		<input
			class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
			bind:value={responsePath}
			oninput={onchange}
			placeholder="$.data"
		/>
	</div>

	<button
		class="rounded bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100"
		onclick={testConnection}
	>
		Test Connection
	</button>
</div>
