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

export interface WorkflowResult {
	id: string;
	name: string;
	description: string | null;
	query: string | null;
}

export interface SourceResult {
	id: string;
	workflow_id: string;
	table_name: string;
	type: string;
	config: Record<string, unknown>;
}

export async function createWorkflow(
	name: string,
	description?: string
): Promise<WorkflowResult> {
	return request<WorkflowResult>('POST', '/workflows', { name, description });
}

export async function deleteWorkflow(id: string): Promise<void> {
	return request<void>('DELETE', `/workflows/${id}`);
}

export async function deleteAllWorkflows(): Promise<void> {
	const workflows = await request<WorkflowResult[]>('GET', '/workflows');
	for (const w of workflows) {
		await deleteWorkflow(w.id);
	}
}

export async function addSource(
	workflowId: string,
	type: string,
	tableName: string,
	config?: Record<string, unknown>
): Promise<SourceResult> {
	return request<SourceResult>('POST', `/workflows/${workflowId}/sources`, {
		type,
		table_name: tableName,
		config: config ?? {},
	});
}

export async function updateWorkflow(
	workflowId: string,
	data: { name?: string; query?: string }
): Promise<WorkflowResult> {
	return request<WorkflowResult>('PUT', `/workflows/${workflowId}`, data);
}
