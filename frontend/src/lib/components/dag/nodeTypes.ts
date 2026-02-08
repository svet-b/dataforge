import type { NodeTypes } from '@xyflow/svelte';
import SourceApiNode from './SourceApiNode.svelte';
import SourceFileNode from './SourceFileNode.svelte';
import TransformNode from './TransformNode.svelte';
import OutputNode from './OutputNode.svelte';

export const nodeTypes: NodeTypes = {
	sourceApi: SourceApiNode as any,
	sourceFile: SourceFileNode as any,
	transform: TransformNode as any,
	output: OutputNode as any
};
