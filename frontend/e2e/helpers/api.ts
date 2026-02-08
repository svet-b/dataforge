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
}

export interface NodeResult {
	id: string;
	pipeline_id: string;
	type: string;
	name: string;
	output_table_name: string;
}

export interface EdgeResult {
	id: string;
	source_node_id: string;
	target_node_id: string;
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

export async function createNode(
	pipelineId: string,
	type: string,
	name: string,
	opts?: {
		config?: Record<string, unknown>;
		outputTableName?: string;
		positionX?: number;
		positionY?: number;
	}
): Promise<NodeResult> {
	return request<NodeResult>('POST', `/pipelines/${pipelineId}/nodes`, {
		type,
		name,
		position_x: opts?.positionX ?? 100,
		position_y: opts?.positionY ?? 100,
		config: opts?.config ?? {},
		output_table_name: opts?.outputTableName ?? name.toLowerCase().replace(/\s+/g, '_'),
	});
}

export async function createEdge(
	pipelineId: string,
	sourceNodeId: string,
	targetNodeId: string
): Promise<EdgeResult> {
	return request<EdgeResult>('POST', `/pipelines/${pipelineId}/edges`, {
		source_node_id: sourceNodeId,
		target_node_id: targetNodeId,
	});
}
