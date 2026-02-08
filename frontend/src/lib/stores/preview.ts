import { writable } from 'svelte/store';
import type { SchemaColumn } from '$lib/types/index.js';
import { api, ApiError } from '$lib/api/client.js';

interface PreviewState {
	nodeId: string | null;
	loading: boolean;
	data: Record<string, unknown>[];
	schema: SchemaColumn[];
	rowCount: number | null;
	error: string | null;
	durationMs: number | null;
}

const initial: PreviewState = {
	nodeId: null,
	loading: false,
	data: [],
	schema: [],
	rowCount: null,
	error: null,
	durationMs: null
};

export const previewStore = writable<PreviewState>(initial);

export async function runPreview(pipelineId: string, nodeId: string) {
	previewStore.set({ ...initial, nodeId, loading: true });
	try {
		const result = await api.execution.preview(pipelineId, nodeId);
		previewStore.set({
			nodeId,
			loading: false,
			data: (result.data as Record<string, unknown>[]) ?? [],
			schema: result.schema_info ?? [],
			rowCount: result.row_count,
			error: result.status === 'success' ? null : String(result.error ?? 'Unknown error'),
			durationMs: result.duration_ms
		});
	} catch (e) {
		const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
		previewStore.set({ ...initial, nodeId, error: msg });
	}
}

export function clearPreview() {
	previewStore.set(initial);
}
