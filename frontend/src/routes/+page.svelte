<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api/client.js';
	import type { PipelineSummary } from '$lib/types/index.js';
	import { addToast } from '$lib/stores/toasts.js';

	let pipelines = $state<PipelineSummary[]>([]);
	let loading = $state(true);
	let showCreateModal = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let confirmDeleteId = $state<string | null>(null);

	function autoFocus(node: HTMLElement) {
		node.focus();
	}

	onMount(loadPipelines);

	async function loadPipelines() {
		loading = true;
		try {
			pipelines = await api.pipelines.list();
		} catch (e) {
			addToast('Failed to load pipelines', 'error');
		} finally {
			loading = false;
		}
	}

	async function createPipeline() {
		if (!newName.trim()) return;
		try {
			const pipeline = await api.pipelines.create({
				name: newName.trim(),
				description: newDescription.trim() || undefined
			});
			showCreateModal = false;
			newName = '';
			newDescription = '';
			goto(`/pipelines/${pipeline.id}`);
		} catch (e) {
			addToast('Failed to create pipeline', 'error');
		}
	}

	async function deletePipeline(id: string) {
		try {
			await api.pipelines.delete(id);
			pipelines = pipelines.filter((p) => p.id !== id);
			confirmDeleteId = null;
			addToast('Pipeline deleted', 'success');
		} catch (e) {
			addToast('Failed to delete pipeline', 'error');
		}
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<div class="min-h-screen bg-gray-50">
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
			<h1 class="text-xl font-bold text-gray-900">DataForge</h1>
			<button
				class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700"
				onclick={() => (showCreateModal = true)}
			>
				New Pipeline
			</button>
		</div>
	</header>

	<main class="mx-auto max-w-5xl px-6 py-8">
		{#if loading}
			<div class="py-12 text-center text-gray-500">Loading...</div>
		{:else if pipelines.length === 0}
			<div class="py-12 text-center" data-testid="empty-state">
				<p class="text-lg text-gray-500">No pipelines yet</p>
				<p class="mt-1 text-sm text-gray-400">Create your first pipeline to get started.</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pipeline-grid">
				{#each pipelines as pipeline (pipeline.id)}
					<div class="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow" data-testid="pipeline-card">
						<a
							href="/pipelines/{pipeline.id}"
							class="block"
						>
							<h3 class="font-semibold text-gray-900">{pipeline.name}</h3>
							{#if pipeline.description}
								<p class="mt-1 text-sm text-gray-500 line-clamp-2">{pipeline.description}</p>
							{/if}
							<div class="mt-3 flex items-center gap-3 text-xs text-gray-400">
								<span>{pipeline.node_count} nodes</span>
								<span>Updated {formatDate(pipeline.updated_at)}</span>
							</div>
						</a>
						<button
							class="absolute right-2 top-2 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
							onclick={(e) => { e.preventDefault(); confirmDeleteId = pipeline.id; }}
							aria-label="Delete pipeline"
						>
							<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<!-- Create Modal -->
{#if showCreateModal}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" data-testid="create-pipeline-modal">
			<h2 class="text-lg font-semibold text-gray-900">New Pipeline</h2>
			<div class="mt-4 space-y-3">
				<div>
					<label for="pipeline-name" class="block text-sm font-medium text-gray-700">Name</label>
					<input
						id="pipeline-name"
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						bind:value={newName}
						placeholder="My Pipeline"
					onkeydown={(e) => e.key === 'Enter' && createPipeline()}
					use:autoFocus
					/>
				</div>
				<div>
					<label for="pipeline-desc" class="block text-sm font-medium text-gray-700">Description (optional)</label>
					<textarea
						id="pipeline-desc"
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						bind:value={newDescription}
						rows={2}
						placeholder="What does this pipeline do?"
					></textarea>
				</div>
			</div>
			<div class="mt-5 flex justify-end gap-2">
				<button
					class="rounded px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
					onclick={() => (showCreateModal = false)}
				>
					Cancel
				</button>
				<button
					class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
					onclick={createPipeline}
					disabled={!newName.trim()}
				>
					Create
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Delete Confirm Modal -->
{#if confirmDeleteId}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl" data-testid="delete-confirm-modal">
			<h2 class="text-lg font-semibold text-gray-900">Delete Pipeline?</h2>
			<p class="mt-2 text-sm text-gray-500">This action cannot be undone. All nodes and edges will be permanently deleted.</p>
			<div class="mt-5 flex justify-end gap-2">
				<button
					class="rounded px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
					onclick={() => (confirmDeleteId = null)}
				>
					Cancel
				</button>
				<button
					class="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
					onclick={() => confirmDeleteId && deletePipeline(confirmDeleteId)}
				>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}
