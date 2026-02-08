<script lang="ts">
	import { previewStore } from '$lib/stores/preview.js';

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
		const data = $previewStore.data;
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
</script>

{#if $previewStore.loading}
	<div class="flex h-full items-center justify-center text-sm text-gray-500">
		<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<circle cx="12" cy="12" r="10" class="opacity-25" />
			<path d="M4 12a8 8 0 0 1 8-8" class="opacity-75" stroke-linecap="round" />
		</svg>
		Loading preview...
	</div>
{:else if $previewStore.error}
	<div class="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{$previewStore.error}</div>
{:else if $previewStore.data.length === 0}
	<div class="flex h-full items-center justify-center text-sm text-gray-400">
		No preview data. Select a node and click Preview.
	</div>
{:else}
	<div class="flex h-full flex-col">
		<div class="shrink-0 border-b border-gray-200 px-3 py-1 text-xs text-gray-500">
			Showing {sortedData.length} of {$previewStore.rowCount ?? sortedData.length} rows
			{#if $previewStore.durationMs != null}
				&middot; {$previewStore.durationMs}ms
			{/if}
		</div>
		<div class="flex-1 overflow-auto">
			<table class="w-full border-collapse font-mono text-xs">
				<thead>
					<tr class="sticky top-0 z-10 bg-gray-50">
						{#each $previewStore.schema as col}
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
							{#each $previewStore.schema as col}
								<td class="border-r border-gray-100 px-2 py-1 text-gray-700">
									{row[col.name] ?? ''}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}
