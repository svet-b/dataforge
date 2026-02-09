const BASE = 'http://localhost:5173/api';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const opts: RequestInit = {
		method,
		headers: { 'Content-Type': 'application/json' },
	};
	if (body !== undefined) {
		opts.body = JSON.stringify(body);
	}
	const res = await fetch(`${BASE}${path}`, opts);
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
	}
	if (res.status === 204) return undefined as T;
	return res.json();
}

export interface PipelineResult {
	id: string;
	name: string;
	description: string | null;
	query: string | null;
}

export interface SourceResult {
	id: string;
	pipeline_id: string;
	table_name: string;
	type: string;
	config: Record<string, unknown>;
}

export async function createPipeline(
	name: string,
	description?: string
): Promise<PipelineResult> {
	return request<PipelineResult>('POST', '/pipelines', { name, description });
}

export async function deletePipeline(id: string): Promise<void> {
	return request<void>('DELETE', `/pipelines/${id}`);
}

export async function deleteAllPipelines(): Promise<void> {
	const pipelines = await request<PipelineResult[]>('GET', '/pipelines');
	for (const p of pipelines) {
		await deletePipeline(p.id);
	}
}

export async function addSource(
	pipelineId: string,
	type: string,
	tableName: string,
	config?: Record<string, unknown>
): Promise<SourceResult> {
	return request<SourceResult>('POST', `/pipelines/${pipelineId}/sources`, {
		type,
		table_name: tableName,
		config: config ?? {},
	});
}

export async function updatePipeline(
	pipelineId: string,
	data: { name?: string; query?: string }
): Promise<PipelineResult> {
	return request<PipelineResult>('PUT', `/pipelines/${pipelineId}`, data);
}
