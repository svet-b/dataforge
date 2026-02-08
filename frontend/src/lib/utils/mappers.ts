import type { Node, Edge } from '@xyflow/svelte';
import type { NodeResponse, EdgeResponse } from '$lib/types/index.js';

export interface FlowNodeData {
	label: string;
	outputTableName: string;
	config: Record<string, unknown>;
	backendType: string;
	[key: string]: unknown;
}

const TYPE_MAP: Record<string, string> = {
	source_api: 'sourceApi',
	source_file: 'sourceFile',
	transform: 'transform',
	output: 'output'
};

export function backendNodeToFlowNode(node: NodeResponse): Node<FlowNodeData> {
	return {
		id: node.id,
		type: TYPE_MAP[node.type] ?? node.type,
		position: { x: node.position_x, y: node.position_y },
		data: {
			label: node.name,
			outputTableName: node.output_table_name,
			config: node.config,
			backendType: node.type
		}
	};
}

export function backendEdgeToFlowEdge(edge: EdgeResponse): Edge {
	return {
		id: edge.id,
		source: edge.source_node_id,
		target: edge.target_node_id
	};
}

export function flowNodeToPositionUpdate(node: Node) {
	return {
		position_x: node.position.x,
		position_y: node.position.y
	};
}
