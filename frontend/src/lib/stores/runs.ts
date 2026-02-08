import { writable } from 'svelte/store';
import type { RunHistorySummary, RunHistoryDetail } from '$lib/types/index.js';
import { api, ApiError } from '$lib/api/client.js';

interface RunsState {
	runs: RunHistorySummary[];
	expandedRun: RunHistoryDetail | null;
	loading: boolean;
}

const initial: RunsState = {
	runs: [],
	expandedRun: null,
	loading: false
};

export const runsStore = writable<RunsState>(initial);

export async function loadRuns(pipelineId: string) {
	runsStore.update((s) => ({ ...s, loading: true }));
	try {
		const runs = await api.runs.list(pipelineId);
		runsStore.set({ runs, expandedRun: null, loading: false });
	} catch (e) {
		const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
		console.error('Failed to load runs:', msg);
		runsStore.update((s) => ({ ...s, loading: false }));
	}
}

export async function loadRunDetail(pipelineId: string, runId: string) {
	try {
		const detail = await api.runs.get(pipelineId, runId);
		runsStore.update((s) => ({ ...s, expandedRun: detail }));
	} catch (e) {
		const msg = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
		console.error('Failed to load run detail:', msg);
	}
}

export function resetRunsStore() {
	runsStore.set(initial);
}
