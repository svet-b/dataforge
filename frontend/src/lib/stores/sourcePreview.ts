import { writable } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { SourcePreviewResult } from '$lib/types/index.js';

interface SourcePreviewState {
	loading: boolean;
	sources: SourcePreviewResult[];
	selectedSource: string | null;
	error: string | null;
	durationMs: number | null;
	cached: boolean;
}

const initial: SourcePreviewState = {
	loading: false,
	sources: [],
	selectedSource: null,
	error: null,
	durationMs: null,
	cached: false
};

export const sourcePreviewStore = writable<SourcePreviewState>(initial);

export async function loadSourcePreview(pipelineId: string) {
	sourcePreviewStore.set({ ...initial, loading: true });
	try {
		const result = await api.execution.previewSources(pipelineId);
		sourcePreviewStore.set({
			loading: false,
			sources: result.sources,
			selectedSource: result.sources.length > 0 ? result.sources[0].name : null,
			error: null,
			durationMs: result.duration_ms,
			cached: true
		});
	} catch (e) {
		sourcePreviewStore.set({
			...initial,
			error: e instanceof Error ? e.message : 'Failed to load sources'
		});
	}
}

export function selectSource(name: string) {
	sourcePreviewStore.update((s) => ({ ...s, selectedSource: name }));
}

export function resetSourcePreview() {
	sourcePreviewStore.set(initial);
}
