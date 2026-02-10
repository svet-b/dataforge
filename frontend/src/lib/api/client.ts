import type {
	PipelineSummary,
	PipelineResponse,
	PipelineDetail,
	PipelineCreate,
	PipelineUpdate,
	SourceResponse,
	SourceCreate,
	SourceUpdate,
	RunRequest,
	RunResponse,
	UploadedFileResponse,
	RunHistorySummary,
	RunHistoryDetail,
	TableSchema,
	GenerateSQLRequest,
	GenerateSQLResponse,
	LlmStatus,
	CTEInspectionResponse
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

async function requestFormData<T>(method: string, path: string, formData: FormData): Promise<T> {
	const res = await fetch(path, { method, body: formData });
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
	sources: {
		create: (pipelineId: string, data: SourceCreate) =>
			request<SourceResponse>('POST', `/api/pipelines/${pipelineId}/sources`, data),
		update: (pipelineId: string, sourceId: string, data: SourceUpdate) =>
			request<SourceResponse>(
				'PUT',
				`/api/pipelines/${pipelineId}/sources/${sourceId}`,
				data
			),
		delete: (pipelineId: string, sourceId: string) =>
			request<void>('DELETE', `/api/pipelines/${pipelineId}/sources/${sourceId}`)
	},
	execution: {
		run: (pipelineId: string, data: RunRequest = {}) =>
			request<RunResponse>('POST', `/api/pipelines/${pipelineId}/run`, data),
		inspectCtes: (pipelineId: string, data: RunRequest = {}) =>
			request<CTEInspectionResponse>(
				'POST',
				`/api/pipelines/${pipelineId}/inspect-ctes`,
				data
			)
	},
	files: {
		upload: (pipelineId: string, file: File) => {
			const fd = new FormData();
			fd.append('file', file);
			return requestFormData<UploadedFileResponse>(
				'POST',
				`/api/pipelines/${pipelineId}/files`,
				fd
			);
		},
		list: (pipelineId: string) =>
			request<UploadedFileResponse[]>('GET', `/api/pipelines/${pipelineId}/files`),
		delete: (pipelineId: string, fileId: string) =>
			request<void>('DELETE', `/api/pipelines/${pipelineId}/files/${fileId}`)
	},
	runs: {
		list: (pipelineId: string, limit = 20) =>
			request<RunHistorySummary[]>(
				'GET',
				`/api/pipelines/${pipelineId}/runs?limit=${limit}`
			),
		get: (pipelineId: string, runId: string) =>
			request<RunHistoryDetail>('GET', `/api/pipelines/${pipelineId}/runs/${runId}`)
	},
	download: {
		url: (pipelineId: string, runId: string, format: 'csv' | 'json') =>
			`/api/pipelines/${pipelineId}/runs/${runId}/download?format=${format}`
	},
	describeSources: {
		get: (pipelineId: string) =>
			request<TableSchema[]>('POST', `/api/pipelines/${pipelineId}/describe-sources`)
	},
	llm: {
		generateSql: (data: GenerateSQLRequest) =>
			request<GenerateSQLResponse>('POST', '/api/llm/generate-sql', data),
		status: () => request<LlmStatus>('GET', '/api/llm/status')
	}
};
