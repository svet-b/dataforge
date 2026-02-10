import { writable } from 'svelte/store';
import { api } from '$lib/api/client.js';
import type { CTEResult } from '$lib/types/index.js';

interface CTEInspectionState {
	loading: boolean;
	ctes: CTEResult[];
	selectedCte: string | null;
	error: string | null;
	durationMs: number | null;
}

const initial: CTEInspectionState = {
	loading: false,
	ctes: [],
	selectedCte: null,
	error: null,
	durationMs: null
};

export const cteInspectionStore = writable<CTEInspectionState>(initial);

export async function loadCteInspection(
	pipelineId: string,
	parameters: Record<string, unknown> = {}
) {
	cteInspectionStore.set({ ...initial, loading: true });
	try {
		const result = await api.execution.inspectCtes(pipelineId, { parameters });
		if (result.status === 'success') {
			cteInspectionStore.set({
				loading: false,
				ctes: result.ctes,
				selectedCte: result.ctes.length > 0 ? result.ctes[0].name : null,
				error: null,
				durationMs: result.duration_ms
			});
		} else {
			cteInspectionStore.set({
				...initial,
				error: result.error?.message ?? 'CTE inspection failed'
			});
		}
	} catch (e) {
		cteInspectionStore.set({
			...initial,
			error: e instanceof Error ? e.message : 'CTE inspection failed'
		});
	}
}

export function selectCte(name: string) {
	cteInspectionStore.update((s) => ({ ...s, selectedCte: name }));
}

export function resetCteInspection() {
	cteInspectionStore.set(initial);
}
