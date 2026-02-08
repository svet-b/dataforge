<script lang="ts">
	import { toasts } from '$lib/stores/toasts.js';

	const colorMap = {
		success: 'bg-green-500',
		error: 'bg-red-500',
		info: 'bg-blue-500'
	};
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" data-testid="toast-container">
	{#each $toasts as toast (toast.id)}
		<div
			data-testid="toast"
			class="pointer-events-auto rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg {colorMap[toast.type]}"
		>
			{toast.message}
		</div>
	{/each}
</div>
