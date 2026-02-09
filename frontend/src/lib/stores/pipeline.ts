import { writable } from 'svelte/store';
import { api, ApiError } from '$lib/api/client.js';
import type {
	PipelineDetail,
	PipelineParameter,
	SourceResponse,
	SourceType
} from '$lib/types/index.js';
import { addToast } from './toasts.js';

interface PipelineState {
	pipeline: PipelineDetail | null;
	loading: boolean;
	error: string | null;
	selectedSourceId: string | null;
}

const initial: PipelineState = {
	pipeline: null,
	loading: false,
	error: null,
	selectedSourceId: null,
};

export const pipelineStore = writable<PipelineState>(initial);

function errorMsg(e: unknown): string {
	if (e instanceof ApiError) return e.detail;
	if (e instanceof Error) return e.message;
	return String(e);
}

export async function loadPipeline(id: string) {
	pipelineStore.update((s) => ({ ...s, loading: true, error: null }));
	try {
		const pipeline = await api.pipelines.get(id);
		pipelineStore.set({
			pipeline,
			loading: false,
			error: null,
			selectedSourceId: null,
		});
	} catch (e) {
		pipelineStore.update((s) => ({ ...s, loading: false, error: errorMsg(e) }));
	}
}

export async function addSource(
	pipelineId: string,
	type: SourceType,
	tableName: string
): Promise<SourceResponse | null> {
	try {
		const source = await api.sources.create(pipelineId, {
			type,
			table_name: tableName,
			config: {},
		});
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return {
				...s,
				pipeline: {
					...s.pipeline,
					sources: [...s.pipeline.sources, source],
				},
				selectedSourceId: source.id,
			};
		});
		return source;
	} catch (e) {
		addToast(errorMsg(e), 'error');
		return null;
	}
}

export async function updateSource(
	pipelineId: string,
	sourceId: string,
	data: { table_name?: string; config?: Record<string, unknown> }
) {
	try {
		const updated = await api.sources.update(pipelineId, sourceId, data);
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return {
				...s,
				pipeline: {
					...s.pipeline,
					sources: s.pipeline.sources.map((src) =>
						src.id === sourceId ? updated : src
					),
				},
			};
		});
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function deleteSource(pipelineId: string, sourceId: string) {
	try {
		await api.sources.delete(pipelineId, sourceId);
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return {
				...s,
				pipeline: {
					...s.pipeline,
					sources: s.pipeline.sources.filter((src) => src.id !== sourceId),
				},
				selectedSourceId:
					s.selectedSourceId === sourceId ? null : s.selectedSourceId,
			};
		});
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export function selectSource(sourceId: string | null) {
	pipelineStore.update((s) => ({ ...s, selectedSourceId: sourceId }));
}

export async function updatePipelineName(pipelineId: string, name: string) {
	try {
		const updated = await api.pipelines.update(pipelineId, { name });
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return { ...s, pipeline: { ...s.pipeline, name: updated.name } };
		});
		addToast('Pipeline name saved', 'success');
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function updatePipelineQuery(pipelineId: string, query: string) {
	try {
		await api.pipelines.update(pipelineId, { query });
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return { ...s, pipeline: { ...s.pipeline, query } };
		});
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function updatePipelineParams(
	pipelineId: string,
	parameters: PipelineParameter[]
) {
	try {
		const updated = await api.pipelines.update(pipelineId, { parameters });
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return {
				...s,
				pipeline: { ...s.pipeline, parameters: updated.parameters ?? [] },
			};
		});
		addToast('Parameters saved', 'success');
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function runPipeline(
	pipelineId: string,
	parameters: Record<string, unknown> = {}
) {
	try {
		const result = await api.execution.run(pipelineId, { parameters });
		if (result.status === 'success') {
			addToast(
				`Run complete: ${result.row_count ?? 0} rows in ${result.duration_ms}ms`,
				'success'
			);
		} else {
			const errorDetail = result.error as Record<string, unknown> | null;
			addToast(`Run failed: ${errorDetail?.message ?? 'Unknown error'}`, 'error');
		}
		return result;
	} catch (e) {
		addToast(errorMsg(e), 'error');
		return null;
	}
}

export function resetPipelineStore() {
	pipelineStore.set(initial);
}
