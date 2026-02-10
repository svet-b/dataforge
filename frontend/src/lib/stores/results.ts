import { writable } from 'svelte/store';
import type { SchemaColumn, RunResponse } from '$lib/types/index.js';

interface ResultsState {
	loading: boolean;
	data: Record<string, unknown>[];
	schema: SchemaColumn[];
	rowCount: number | null;
	runId: string | null;
	error: string | null;
	durationMs: number | null;
}

const initial: ResultsState = {
	loading: false,
	data: [],
	schema: [],
	rowCount: null,
	runId: null,
	error: null,
	durationMs: null,
};

export const resultsStore = writable<ResultsState>(initial);

export function setResultsLoading() {
	resultsStore.set({ ...initial, loading: true });
}

export function setResults(result: RunResponse) {
	resultsStore.set({
		loading: false,
		data: (result.data as Record<string, unknown>[]) ?? [],
		schema: result.schema_info ?? [],
		rowCount: result.row_count,
		runId: result.run_id,
		error: result.status === 'success' ? null : (result.error?.message ?? 'Unknown error'),
		durationMs: result.duration_ms,
	});
}

export function setResultsError(msg: string) {
	resultsStore.set({ ...initial, error: msg });
}

export function clearResults() {
	resultsStore.set(initial);
}
