import { writable } from 'svelte/store';
import type { Node, Edge } from '@xyflow/svelte';
import { api, ApiError } from '$lib/api/client.js';
import type { PipelineDetail, NodeType } from '$lib/types/index.js';
import {
	backendNodeToFlowNode,
	backendEdgeToFlowEdge,
	flowNodeToPositionUpdate,
	type FlowNodeData
} from '$lib/utils/mappers.js';
import { addToast } from './toasts.js';

interface PipelineState {
	pipeline: PipelineDetail | null;
	nodes: Node<FlowNodeData>[];
	edges: Edge[];
	loading: boolean;
	error: string | null;
}

const initial: PipelineState = {
	pipeline: null,
	nodes: [],
	edges: [],
	loading: false,
	error: null
};

export const pipelineStore = writable<PipelineState>(initial);

function errorMsg(e: unknown): string {
	if (e instanceof ApiError) return e.detail;
	if (e instanceof Error) return e.message;
	return String(e);
}

export async function loadPipeline(id: string) {
	pipelineStore.update((s) => ({ ...s, loading: true, error: null }));
	try {
		const pipeline = await api.pipelines.get(id);
		const nodes = pipeline.nodes.map(backendNodeToFlowNode);
		const edges = pipeline.edges.map(backendEdgeToFlowEdge);
		pipelineStore.set({ pipeline, nodes, edges, loading: false, error: null });
	} catch (e) {
		pipelineStore.update((s) => ({ ...s, loading: false, error: errorMsg(e) }));
	}
}

let nodeCounter = 0;

export async function addNodeAction(
	pipelineId: string,
	type: NodeType,
	positionX: number,
	positionY: number
): Promise<Node<FlowNodeData> | null> {
	nodeCounter++;
	const prefix = type.replace('source_', '');
	const name = `${prefix}_${nodeCounter}`;
	const outputTableName = `${prefix}_${nodeCounter}`;
	try {
		const node = await api.nodes.create(pipelineId, {
			type,
			name,
			position_x: positionX,
			position_y: positionY,
			config: {},
			output_table_name: outputTableName
		});
		const flowNode = backendNodeToFlowNode(node);
		pipelineStore.update((s) => ({ ...s, nodes: [...s.nodes, flowNode] }));
		return flowNode;
	} catch (e) {
		addToast(errorMsg(e), 'error');
		return null;
	}
}

export async function updateNodePosition(pipelineId: string, node: Node) {
	try {
		await api.nodes.update(pipelineId, node.id, flowNodeToPositionUpdate(node));
	} catch (e) {
		addToast(`Failed to save position: ${errorMsg(e)}`, 'error');
	}
}

export async function deleteNodeAction(pipelineId: string, nodeId: string) {
	try {
		await api.nodes.delete(pipelineId, nodeId);
		pipelineStore.update((s) => ({
			...s,
			nodes: s.nodes.filter((n) => n.id !== nodeId),
			edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId)
		}));
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function addEdgeAction(
	pipelineId: string,
	sourceId: string,
	targetId: string
): Promise<Edge | null> {
	try {
		const edge = await api.edges.create(pipelineId, {
			source_node_id: sourceId,
			target_node_id: targetId
		});
		const flowEdge = backendEdgeToFlowEdge(edge);
		pipelineStore.update((s) => ({ ...s, edges: [...s.edges, flowEdge] }));
		return flowEdge;
	} catch (e) {
		addToast(errorMsg(e), 'error');
		return null;
	}
}

export async function deleteEdgeAction(pipelineId: string, edgeId: string) {
	try {
		await api.edges.delete(pipelineId, edgeId);
		pipelineStore.update((s) => ({
			...s,
			edges: s.edges.filter((e) => e.id !== edgeId)
		}));
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function updatePipelineName(pipelineId: string, name: string) {
	try {
		const updated = await api.pipelines.update(pipelineId, { name });
		pipelineStore.update((s) => {
			if (!s.pipeline) return s;
			return { ...s, pipeline: { ...s.pipeline, name: updated.name } };
		});
		addToast('Pipeline name saved', 'success');
	} catch (e) {
		addToast(errorMsg(e), 'error');
	}
}

export async function runPipeline(pipelineId: string) {
	try {
		const result = await api.execution.run(pipelineId);
		if (result.status === 'success') {
			addToast(
				`Run complete: ${result.row_count ?? 0} rows in ${result.duration_ms}ms`,
				'success'
			);
		} else {
			addToast(`Run failed: ${result.error?.message ?? 'Unknown error'}`, 'error');
		}
		return result;
	} catch (e) {
		addToast(errorMsg(e), 'error');
		return null;
	}
}

export function resetPipelineStore() {
	nodeCounter = 0;
	pipelineStore.set(initial);
}
