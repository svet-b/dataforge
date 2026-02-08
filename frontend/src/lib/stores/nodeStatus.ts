import { writable } from 'svelte/store';
import type { NodeStatus } from '$lib/types/index.js';

export const nodeStatusStore = writable<Record<string, NodeStatus>>({});

export function setNodeStatus(nodeId: string, status: NodeStatus) {
	nodeStatusStore.update((s) => ({ ...s, [nodeId]: status }));
}

export function setAllNodeStatuses(statuses: Record<string, NodeStatus>) {
	nodeStatusStore.set(statuses);
}

export function clearNodeStatuses() {
	nodeStatusStore.set({});
}
