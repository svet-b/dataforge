export interface PipelineParameter {
	name: string;
	type: string;
	default?: string | null;
	description?: string | null;
}

export interface PipelineSummary {
	id: string;
	name: string;
	description: string | null;
	source_count: number;
	created_at: string;
	updated_at: string;
}

export interface PipelineResponse {
	id: string;
	name: string;
	description: string | null;
	query: string | null;
	parameters: PipelineParameter[];
	created_at: string;
	updated_at: string;
}

export interface SourceResponse {
	id: string;
	pipeline_id: string;
	table_name: string;
	type: 'file' | 'api';
	config: Record<string, unknown>;
}

export interface PipelineDetail extends PipelineResponse {
	sources: SourceResponse[];
}

export interface PipelineCreate {
	name: string;
	description?: string | null;
	parameters?: PipelineParameter[];
}

export interface PipelineUpdate {
	name?: string | null;
	description?: string | null;
	query?: string | null;
	parameters?: PipelineParameter[] | null;
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
}

export interface UploadedFileResponse {
	id: string;
	pipeline_id: string;
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
	pipeline_id: string;
	parameters: Record<string, unknown>;
	status: string;
	started_at: string;
	duration_ms: number;
	row_count: number | null;
	schema_info: SchemaColumn[] | null;
	error: ExecutionError | null;
}

export interface RunHistoryDetail extends RunHistorySummary {
	completed_at: string | null;
	output_preview: Record<string, unknown>[] | null;
}
