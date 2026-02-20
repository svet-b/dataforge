import type {
  ChatMessage,
  ContentResponse,
  WorkflowSummary,
  WorkflowResponse,
  WorkflowDetail,
  WorkflowCreate,
  WorkflowUpdate,
  SourceResponse,
  SourceCreate,
  SourceUpdate,
  RunRequest,
  RunResponse,
  UploadedFileResponse,
  RunHistorySummary,
  RunHistoryDetail,
  LlmStatus,
  CTEInspectionResponse,
  QueryHistoryEntry,
  SourcePreviewResponse,
  SourceRawResponse,
  SourceSchemaResponse,
  ValidateQueryResponse,
  AgentChatRequest,
  AgentToolCallEvent,
  AgentToolResultEvent,
  AgentThinkingEvent,
  AgentResultEvent,
  AgentMessageEvent,
  AgentErrorEvent,
  AgentUsageEvent,
} from '@/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
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
  workflows: {
    list: () => request<WorkflowSummary[]>('GET', '/api/workflows'),
    create: (data: WorkflowCreate) =>
      request<WorkflowResponse>('POST', '/api/workflows', data),
    get: (id: string) => request<WorkflowDetail>('GET', `/api/workflows/${id}`),
    update: (id: string, data: WorkflowUpdate) =>
      request<WorkflowResponse>('PUT', `/api/workflows/${id}`, data),
    delete: (id: string) => request<void>('DELETE', `/api/workflows/${id}`),
  },
  sources: {
    create: (workflowId: string, data: SourceCreate) =>
      request<SourceResponse>('POST', `/api/workflows/${workflowId}/sources`, data),
    update: (workflowId: string, sourceId: string, data: SourceUpdate) =>
      request<SourceResponse>(
        'PUT',
        `/api/workflows/${workflowId}/sources/${sourceId}`,
        data,
      ),
    delete: (workflowId: string, sourceId: string) =>
      request<void>('DELETE', `/api/workflows/${workflowId}/sources/${sourceId}`),
    schema: (workflowId: string, sourceId: string) =>
      request<SourceSchemaResponse>(
        'POST',
        `/api/workflows/${workflowId}/sources/${sourceId}/schema`,
      ),
    fetchRaw: (workflowId: string, sourceId: string) =>
      request<SourceRawResponse>(
        'POST',
        `/api/workflows/${workflowId}/sources/${sourceId}/raw-response`,
      ),
  },
  execution: {
    run: (workflowId: string, data: RunRequest = {}) =>
      request<RunResponse>('POST', `/api/workflows/${workflowId}/run`, data),
    inspectCtes: (workflowId: string, data: RunRequest = {}) =>
      request<CTEInspectionResponse>(
        'POST',
        `/api/workflows/${workflowId}/inspect-ctes`,
        data,
      ),
    previewSources: (workflowId: string) =>
      request<SourcePreviewResponse>(
        'POST',
        `/api/workflows/${workflowId}/preview-sources`,
      ),
    validateQuery: (workflowId: string, query: string) =>
      request<ValidateQueryResponse>(
        'POST',
        `/api/workflows/${workflowId}/validate-query`,
        { query },
      ),
  },
  files: {
    upload: (workflowId: string, file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return requestFormData<UploadedFileResponse>(
        'POST',
        `/api/workflows/${workflowId}/files`,
        fd,
      );
    },
    list: (workflowId: string) =>
      request<UploadedFileResponse[]>('GET', `/api/workflows/${workflowId}/files`),
    delete: (workflowId: string, fileId: string) =>
      request<void>('DELETE', `/api/workflows/${workflowId}/files/${fileId}`),
  },
  runs: {
    list: (workflowId: string, limit = 20) =>
      request<RunHistorySummary[]>(
        'GET',
        `/api/workflows/${workflowId}/runs?limit=${limit}`,
      ),
    get: (workflowId: string, runId: string) =>
      request<RunHistoryDetail>('GET', `/api/workflows/${workflowId}/runs/${runId}`),
  },
  content: {
    get: (sha256: string) => request<ContentResponse>('GET', `/api/content/${sha256}`),
    queryHistory: (workflowId: string) =>
      request<QueryHistoryEntry[]>('GET', `/api/workflows/${workflowId}/query-history`),
  },
  download: {
    url: (workflowId: string, runId: string, format: 'csv' | 'json') =>
      `/api/workflows/${workflowId}/runs/${runId}/download?format=${format}`,
  },
  llm: {
    status: () => request<LlmStatus>('GET', '/api/llm/status'),
  },
  chat: {
    list: (workflowId: string) =>
      request<ChatMessage[]>('GET', `/api/workflows/${workflowId}/chat`),
    clear: (workflowId: string) =>
      request<void>('DELETE', `/api/workflows/${workflowId}/chat`),
  },
};

export interface AgentStreamHandlers {
  onToolCall?: (event: AgentToolCallEvent) => void;
  onToolResult?: (event: AgentToolResultEvent) => void;
  onThinking?: (event: AgentThinkingEvent) => void;
  onUsage?: (event: AgentUsageEvent) => void;
  onResult?: (event: AgentResultEvent) => void;
  onMessage?: (event: AgentMessageEvent) => void;
  onError?: (event: AgentErrorEvent) => void;
}

export function streamAgentChat(
  workflowId: string,
  data: AgentChatRequest,
  handlers: AgentStreamHandlers,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = res.statusText;
        try {
          const json = await res.json();
          detail = json.detail ?? JSON.stringify(json);
        } catch {
          // use statusText
        }
        handlers.onError?.({ message: detail });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        handlers.onError?.({ message: 'No response body' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              switch (currentEvent) {
                case 'tool_call':
                  handlers.onToolCall?.(data as AgentToolCallEvent);
                  break;
                case 'tool_result':
                  handlers.onToolResult?.(data as AgentToolResultEvent);
                  break;
                case 'thinking':
                  handlers.onThinking?.(data as AgentThinkingEvent);
                  break;
                case 'usage':
                  handlers.onUsage?.(data as AgentUsageEvent);
                  break;
                case 'result':
                  handlers.onResult?.(data as AgentResultEvent);
                  break;
                case 'message':
                  handlers.onMessage?.(data as AgentMessageEvent);
                  break;
                case 'error':
                  handlers.onError?.(data as AgentErrorEvent);
                  break;
              }
            } catch {
              // skip malformed JSON
            }
            currentEvent = '';
          } else if (line.trim() === '') {
            currentEvent = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError?.({ message: (err as Error).message ?? 'Connection failed' });
      }
    }
  })();

  return controller;
}
