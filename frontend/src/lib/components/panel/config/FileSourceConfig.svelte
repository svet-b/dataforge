<script lang="ts">
	import { updateNodeConfig } from '$lib/stores/pipeline.js';
	import { api } from '$lib/api/client.js';
	import { addToast } from '$lib/stores/toasts.js';
	import { debounce } from '$lib/utils/debounce.js';

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

	let filename = $state((config.filename as string) ?? '');
	let fileType = $state((config.file_type as string) ?? '');
	let delimiter = $state((config.delimiter as string) ?? ',');
	let hasHeader = $state((config.has_header as boolean) ?? true);
	let encoding = $state((config.encoding as string) ?? 'utf-8');
	let sheet = $state((config.sheet as string) ?? '');
	let tableName = $state(outputTableName);
	let uploading = $state(false);
	let dragOver = $state(false);

	const saveConfig = debounce(() => {
		const cfg: Record<string, unknown> = { filename, file_type: fileType };
		if (fileType === 'csv') {
			cfg.delimiter = delimiter;
			cfg.has_header = hasHeader;
			cfg.encoding = encoding;
		} else if (fileType === 'excel') {
			cfg.sheet = sheet || undefined;
		}
		updateNodeConfig(pipelineId, nodeId, {
			config: cfg,
			output_table_name: tableName || undefined
		});
	}, 500);

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

	function onchange() {
		saveConfig();
	}
</script>

<div class="space-y-3 p-3">
	<!-- Drop zone -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="rounded-lg border-2 border-dashed p-4 text-center transition-colors {dragOver
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
			style="position: relative;"
		/>
	</div>

	<div>
		<label class="mb-1 block text-xs font-medium text-gray-600">Output Table</label>
		<input
			class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
			bind:value={tableName}
			oninput={onchange}
			placeholder="file_data"
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
			<div class="w-24">
				<label class="mb-1 block text-xs font-medium text-gray-600">Encoding</label>
				<input
					class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
					bind:value={encoding}
					oninput={onchange}
				/>
			</div>
			<div class="flex items-end gap-1.5 pb-0.5">
				<input type="checkbox" id="header-{nodeId}" bind:checked={hasHeader} onchange={onchange} />
				<label for="header-{nodeId}" class="text-xs text-gray-600">Header row</label>
			</div>
		</div>
	{/if}

	{#if fileType === 'excel'}
		<div>
			<label class="mb-1 block text-xs font-medium text-gray-600">Sheet name</label>
			<input
				class="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
				bind:value={sheet}
				oninput={onchange}
				placeholder="Sheet1"
			/>
		</div>
	{/if}
</div>
