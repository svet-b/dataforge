import type {
	PipelineSummary,
	PipelineResponse,
	PipelineDetail,
	PipelineCreate,
	PipelineUpdate,
	NodeResponse,
	NodeCreate,
	NodeUpdate,
	EdgeResponse,
	EdgeCreate,
	RunRequest,
	RunResponse,
	NodePreviewResponse
} from '$lib/types/index.js';

export class ApiError extends Error {
	constructor(
		public status: number,
		public detail: string
	) {
		super(detail);
		this.name = 'ApiError';
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const opts: RequestInit = {
		method,
		headers: { 'Content-Type': 'application/json' }
	};
	if (body !== undefined) {
		opts.body = JSON.stringify(body);
	}
	const res = await fetch(path, opts);
	if (!res.ok) {
		let detail = res.statusText;
		try {
			const json = await res.json();
			detail = json.detail ?? JSON.stringify(json);
		} catch {
			// use statusText
		}
		throw new ApiError(res.status, detail);
	}
	if (res.status === 204) return undefined as T;
	return res.json();
}

export const api = {
	pipelines: {
		list: () => request<PipelineSummary[]>('GET', '/api/pipelines'),
		create: (data: PipelineCreate) =>
			request<PipelineResponse>('POST', '/api/pipelines', data),
		get: (id: string) => request<PipelineDetail>('GET', `/api/pipelines/${id}`),
		update: (id: string, data: PipelineUpdate) =>
			request<PipelineResponse>('PUT', `/api/pipelines/${id}`, data),
		delete: (id: string) => request<void>('DELETE', `/api/pipelines/${id}`)
	},
	nodes: {
		create: (pipelineId: string, data: NodeCreate) =>
			request<NodeResponse>('POST', `/api/pipelines/${pipelineId}/nodes`, data),
		update: (pipelineId: string, nodeId: string, data: NodeUpdate) =>
			request<NodeResponse>(
				'PUT',
				`/api/pipelines/${pipelineId}/nodes/${nodeId}`,
				data
			),
		delete: (pipelineId: string, nodeId: string) =>
			request<void>('DELETE', `/api/pipelines/${pipelineId}/nodes/${nodeId}`)
	},
	edges: {
		create: (pipelineId: string, data: EdgeCreate) =>
			request<EdgeResponse>('POST', `/api/pipelines/${pipelineId}/edges`, data),
		delete: (pipelineId: string, edgeId: string) =>
			request<void>('DELETE', `/api/pipelines/${pipelineId}/edges/${edgeId}`)
	},
	execution: {
		run: (pipelineId: string, data: RunRequest = {}) =>
			request<RunResponse>('POST', `/api/pipelines/${pipelineId}/run`, data),
		preview: (pipelineId: string, nodeId: string, data: RunRequest = {}) =>
			request<NodePreviewResponse>(
				'POST',
				`/api/pipelines/${pipelineId}/preview/${nodeId}`,
				data
			)
	}
};
