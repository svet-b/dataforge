<script lang="ts">
	import { pipelineStore } from '$lib/stores/pipeline.js';
	import ApiSourceConfig from './config/ApiSourceConfig.svelte';
	import FileSourceConfig from './config/FileSourceConfig.svelte';
	import TransformConfig from './config/TransformConfig.svelte';
	import OutputConfig from './config/OutputConfig.svelte';

	let { pipelineId }: { pipelineId: string } = $props();

	let selectedNode = $derived.by(() => {
		const id = $pipelineStore.selectedNodeId;
		if (!id) return null;
		return $pipelineStore.nodes.find((n) => n.id === id) ?? null;
	});
</script>

{#if !selectedNode}
	<div class="flex h-full items-center justify-center text-sm text-gray-400" data-testid="config-placeholder">
		Select a node to configure
	</div>
{:else if selectedNode.data.backendType === 'source_api'}
	<ApiSourceConfig {pipelineId} nodeId={selectedNode.id} config={selectedNode.data.config} outputTableName={selectedNode.data.outputTableName} />
{:else if selectedNode.data.backendType === 'source_file'}
	<FileSourceConfig {pipelineId} nodeId={selectedNode.id} config={selectedNode.data.config} outputTableName={selectedNode.data.outputTableName} />
{:else if selectedNode.data.backendType === 'transform'}
	<TransformConfig {pipelineId} nodeId={selectedNode.id} config={selectedNode.data.config} outputTableName={selectedNode.data.outputTableName} />
{:else if selectedNode.data.backendType === 'output'}
	<OutputConfig {pipelineId} nodeId={selectedNode.id} config={selectedNode.data.config} outputTableName={selectedNode.data.outputTableName} />
{/if}
