<script lang="ts">
	import type { SourceResponse } from '$lib/types/index.js';
	import { updateSource } from '$lib/stores/pipeline.js';
	import { api } from '$lib/api/client.js';
	import { addToast } from '$lib/stores/toasts.js';
	import { debounce } from '$lib/utils/debounce.js';
	import KeyValueEditor from '$lib/components/panel/config/KeyValueEditor.svelte';

	let {
		pipelineId,
		source,
	}: {
		pipelineId: string;
		source: SourceResponse;
	} = $props();

	// ── File source state ──
	// svelte-ignore state_referenced_locally
	let filename = $state((source.config.filename as string) ?? '');
	// svelte-ignore state_referenced_locally
	let fileType = $state((source.config.file_type as string) ?? '');
	// svelte-ignore state_referenced_locally
	let delimiter = $state((source.config.delimiter as string) ?? ',');
	// svelte-ignore state_referenced_locally
	let hasHeader = $state((source.config.has_header as boolean) ?? true);
	let uploading = $state(false);
	let dragOver = $state(false);

	// ── API source state ──
	// svelte-ignore state_referenced_locally
	let url = $state((source.config.url as string) ?? '');
	// svelte-ignore state_referenced_locally
	let method = $state((source.config.method as string) ?? 'GET');
	// svelte-ignore state_referenced_locally
	let headers = $state<{ key: string; value: string }[]>(
		// svelte-ignore state_referenced_locally
		Array.isArray(source.config.headers)
			? (source.config.headers as { key: string; value: string }[])
			: []
	);
	// svelte-ignore state_referenced_locally
	let body = $state((source.config.body as string) ?? '');
	// svelte-ignore state_referenced_locally
	let responsePath = $state((source.config.response_path as string) ?? '');

	// ── Common ──
	// svelte-ignore state_referenced_locally
	let tableName = $state(source.table_name);

	// Reset state when source changes
	$effect(() => {
		tableName = source.table_name;
		filename = (source.config.filename as string) ?? '';
		fileType = (source.config.file_type as string) ?? '';
		delimiter = (source.config.delimiter as string) ?? ',';
		hasHeader = (source.config.has_header as boolean) ?? true;
		url = (source.config.url as string) ?? '';
		method = (source.config.method as string) ?? 'GET';
		headers = Array.isArray(source.config.headers)
			? (source.config.headers as { key: string; value: string }[])
			: [];
		body = (source.config.body as string) ?? '';
		responsePath = (source.config.response_path as string) ?? '';
	});

	function buildFileConfig(): Record<string, unknown> {
		const cfg: Record<string, unknown> = { filename, file_type: fileType };
		if (fileType === 'csv') {
			cfg.delimiter = delimiter;
			cfg.has_header = hasHeader;
		}
		return cfg;
	}

	function buildApiConfig(): Record<string, unknown> {
		return {
			url,
			method,
			headers: headers.filter((h) => h.key),
			body: method === 'POST' ? body : undefined,
			response_path: responsePath || undefined,
		};
	}

	const saveConfig = debounce(() => {
		const config = source.type === 'file' ? buildFileConfig() : buildApiConfig();
		updateSource(pipelineId, source.id, {
			table_name: tableName || undefined,
			config,
		});
	}, 500);

	function onchange() {
		saveConfig();
	}

	async function handleFile(file: File) {
		uploading = true;
		try {
			const result = await api.files.upload(pipelineId, file);
			filename = result.filename;
			fileType = result.file_type;
			saveConfig.cancel();
			saveConfig();
			addToast(`Uploaded ${result.filename}`, 'success');
		} catch (e) {
			addToast(`Upload failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
		} finally {
			uploading = false;
		}
	}

	function onFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) handleFile(input.files[0]);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.[0]) handleFile(e.dataTransfer.files[0]);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}
</script>

<div class="border-t border-gray-200 bg-gray-50/50" data-testid="source-config">
	<div class="space-y-3 p-3">
		<!-- Table name (common to both types) -->
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Table Name</label>
			<input
				class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
				bind:value={tableName}
				oninput={onchange}
				placeholder="my_table"
			/>
		</div>

		{#if source.type === 'file'}
			<!-- File source config -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative rounded-lg border-2 border-dashed p-3 text-center transition-colors {dragOver
					? 'border-green-400 bg-green-50'
					: 'border-gray-300 hover:border-gray-400'}"
				ondrop={onDrop}
				ondragover={onDragOver}
				ondragleave={onDragLeave}
			>
				{#if uploading}
					<p class="text-sm text-gray-500">Uploading...</p>
				{:else if filename}
					<p class="text-sm font-medium text-gray-700">{filename}</p>
					<p class="text-xs text-gray-400">Drop a new file to replace</p>
				{:else}
					<p class="text-sm text-gray-500">Drop a file here or click to browse</p>
				{/if}
				<input
					type="file"
					class="absolute inset-0 cursor-pointer opacity-0"
					onchange={onFileInput}
					accept=".csv,.tsv,.json,.xlsx,.xls,.parquet"
				/>
			</div>

			{#if fileType === 'csv'}
				<div class="flex gap-3">
					<div class="w-20">
						<label class="mb-1 block text-xs font-medium text-gray-600">Delimiter</label>
						<input
							class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
							bind:value={delimiter}
							oninput={onchange}
						/>
					</div>
					<div class="flex items-end gap-1.5 pb-0.5">
						<input type="checkbox" id="header-{source.id}" bind:checked={hasHeader} onchange={onchange} />
						<label for="header-{source.id}" class="text-xs text-gray-600">Header row</label>
					</div>
				</div>
			{/if}
		{:else}
			<!-- API source config -->
			<div>
				<label class="mb-1 block text-xs font-medium text-gray-600">URL</label>
				<input
					class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
					bind:value={url}
					oninput={onchange}
					placeholder="https://api.example.com/data"
				/>
			</div>

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

			<div>
				<label class="mb-1 block text-xs font-medium text-gray-600">Headers</label>
				<KeyValueEditor bind:entries={headers} keyPlaceholder="Header name" valuePlaceholder="Header value" onchange={onchange} />
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
				<label class="mb-1 block text-xs font-medium text-gray-600">Response Path</label>
				<input
					class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
					bind:value={responsePath}
					oninput={onchange}
					placeholder="data.results"
				/>
			</div>
		{/if}
	</div>
</div>
