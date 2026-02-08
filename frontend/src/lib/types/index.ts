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
	parameter_count: number;
	node_count: number;
	created_at: string;
	updated_at: string;
}

export interface PipelineResponse {
	id: string;
	name: string;
	description: string | null;
	parameters: PipelineParameter[];
	created_at: string;
	updated_at: string;
}

export interface NodeResponse {
	id: string;
	pipeline_id: string;
	type: string;
	name: string;
	position_x: number;
	position_y: number;
	config: Record<string, unknown>;
	output_table_name: string;
}

export interface EdgeResponse {
	id: string;
	pipeline_id: string;
	source_node_id: string;
	target_node_id: string;
}

export interface PipelineDetail extends PipelineResponse {
	nodes: NodeResponse[];
	edges: EdgeResponse[];
}

export interface PipelineCreate {
	name: string;
	description?: string | null;
	parameters?: PipelineParameter[];
}

export interface PipelineUpdate {
	name?: string | null;
	description?: string | null;
	parameters?: PipelineParameter[] | null;
}

export type NodeType = 'source_api' | 'source_file' | 'transform' | 'output';

export interface NodeCreate {
	type: NodeType;
	name: string;
	position_x: number;
	position_y: number;
	config: Record<string, unknown>;
	output_table_name: string;
}

export interface NodeUpdate {
	name?: string | null;
	position_x?: number | null;
	position_y?: number | null;
	config?: Record<string, unknown> | null;
	output_table_name?: string | null;
}

export interface EdgeCreate {
	source_node_id: string;
	target_node_id: string;
}

export interface RunRequest {
	parameters?: Record<string, unknown>;
}

export interface RunResponse {
	run_id: string;
	status: string;
	duration_ms: number;
	row_count: number | null;
	data: Record<string, unknown>[] | null;
	error: Record<string, unknown> | null;
	node_timings: Record<string, unknown>;
}

export interface NodePreviewResponse extends RunResponse {
	schema_info: Record<string, string>[];
}
