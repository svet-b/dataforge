<script lang="ts">
	let {
		entries = $bindable<{ key: string; value: string }[]>([]),
		keyPlaceholder = 'Key',
		valuePlaceholder = 'Value',
		onchange,
	}: {
		entries: { key: string; value: string }[];
		keyPlaceholder?: string;
		valuePlaceholder?: string;
		onchange?: () => void;
	} = $props();

	function addEntry() {
		entries = [...entries, { key: '', value: '' }];
		onchange?.();
	}

	function removeEntry(index: number) {
		entries = entries.filter((_, i) => i !== index);
		onchange?.();
	}
</script>

<div class="space-y-1">
	{#each entries as entry, i}
		<div class="flex items-center gap-1">
			<input
				class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
				placeholder={keyPlaceholder}
				bind:value={entry.key}
				oninput={() => onchange?.()}
			/>
			<input
				class="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
				placeholder={valuePlaceholder}
				bind:value={entry.value}
				oninput={() => onchange?.()}
			/>
			<button
				class="text-gray-400 hover:text-red-500"
				onclick={() => removeEntry(i)}
				aria-label="Remove entry"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	{/each}
	<button class="text-xs text-blue-600 hover:text-blue-700" onclick={addEntry}>
		+ Add
	</button>
</div>
