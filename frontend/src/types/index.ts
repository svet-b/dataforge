export interface WorkflowParameter {
  name: string;
  type: string;
  default?: string | null;
  description?: string | null;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  source_count: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowResponse {
  id: string;
  name: string;
  description: string | null;
  query: string | null;
  parameters: WorkflowParameter[];
  created_at: string;
  updated_at: string;
}

export interface SourceResponse {
  id: string;
  workflow_id: string;
  table_name: string;
  type: 'file' | 'api';
  config: Record<string, unknown>;
}

export interface WorkflowDetail extends WorkflowResponse {
  sources: SourceResponse[];
}

export interface WorkflowCreate {
  name: string;
  description?: string | null;
  parameters?: WorkflowParameter[];
}

export interface WorkflowUpdate {
  name?: string | null;
  description?: string | null;
  query?: string | null;
  parameters?: WorkflowParameter[] | null;
}

export type SourceType = 'file' | 'api';

export interface SourceCreate {
  table_name: string;
  type: SourceType;
  config: Record<string, unknown>;
}

export interface SourceUpdate {
  table_name?: string | null;
  config?: Record<string, unknown> | null;
}

export interface RunRequest {
  parameters?: Record<string, unknown>;
}

export interface SchemaColumn {
  name: string;
  type: string;
}

export interface RunResponse {
  run_id: string;
  status: string;
  duration_ms: number;
  row_count: number | null;
  data: Record<string, unknown>[] | null;
  schema_info: SchemaColumn[];
  error: ExecutionError | null;
  query_hash?: string | null;
  source_config_hash?: string | null;
  parameters_hash?: string | null;
  source_data_hash?: string | null;
  result_hash?: string | null;
}

export interface UploadedFileResponse {
  id: string;
  workflow_id: string;
  filename: string;
  file_type: string;
  uploaded_at: string;
}

export interface ExecutionError {
  message: string;
  sql?: string | null;
}

export interface RunHistorySummary {
  id: string;
  workflow_id: string;
  parameters: Record<string, unknown>;
  status: string;
  started_at: string;
  duration_ms: number;
  row_count: number | null;
  schema_info: SchemaColumn[] | null;
  error: ExecutionError | null;
  query_hash?: string | null;
  source_config_hash?: string | null;
  parameters_hash?: string | null;
  source_data_hash?: string | null;
  result_hash?: string | null;
}

export interface RunHistoryDetail extends RunHistorySummary {
  completed_at: string | null;
  output_preview: Record<string, unknown>[] | null;
}

// LLM types

export interface TableSchema {
  name: string;
  columns: SchemaColumn[];
}

export interface LlmStatus {
  status: string;
  provider: string;
  model?: string;
  error?: string;
}

// Agent types

export interface AgentChatRequest {
  prompt: string;
  conversation_summary?: string | null;
  current_query?: string | null;
}

export interface AgentToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
  iteration: number;
}

export interface AgentToolResultEvent {
  tool: string;
  result: string;
  duration_ms: number;
  iteration: number;
}

export interface AgentThinkingEvent {
  text: string;
  iteration: number;
}

export interface AgentResultEvent {
  sql: string;
  explanation: string;
}

export interface AgentMessageEvent {
  text: string;
}

export interface AgentErrorEvent {
  message: string;
}

export interface AgentUsageEvent {
  iteration: number;
  input_tokens: number;
  output_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface AgentToolStep {
  tool: string;
  input: Record<string, unknown>;
  result?: string;
  duration_ms?: number;
  iteration: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  toolSteps?: AgentToolStep[];
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  workflow_id: string;
  role: 'user' | 'assistant';
  content: string;
  sql: string | null;
  tool_steps: AgentToolStep[] | null;
  is_error: boolean;
  created_at: string;
}

// Source preview types

export interface SourcePreviewResult {
  name: string;
  row_count: number;
  data: Record<string, unknown>[];
  schema_info: SchemaColumn[];
  error?: string | null;
}

export interface SourcePreviewResponse {
  status: string;
  duration_ms: number;
  sources: SourcePreviewResult[];
}

export interface SourceSchemaResponse {
  columns: SchemaColumn[];
  row_count: number;
}

// Query validation types

export interface ValidateQueryResponse {
  valid: boolean;
  error: string | null;
}

// CTE Inspection types

export interface CTEResult {
  name: string;
  ordinal: number;
  row_count: number;
  data: Record<string, unknown>[];
  schema_info: SchemaColumn[];
}

export interface CTEInspectionResponse {
  status: string;
  duration_ms: number;
  ctes: CTEResult[];
  error: ExecutionError | null;
}

export interface SourceRawResponse {
  raw_data: unknown;
  extracted_records: Record<string, unknown>[];
  extracted_count: number;
}

// Content store types

export interface ContentResponse {
  sha256: string;
  kind: string;
  content: string;
  byte_size: number;
}

export interface QueryHistoryEntry {
  query_hash: string;
  query: string;
  first_used: string;
  last_used: string;
  run_count: number;
}
