<script lang="ts">
	import { onMount } from 'svelte';
	import { api, ApiError } from '$lib/api/client.js';
	import { pipelineStore } from '$lib/stores/pipeline.js';
	import type { TableSchema, PipelineParameter } from '$lib/types/index.js';

	let {
		pipelineId,
		onSqlGenerated
	}: {
		pipelineId: string;
		onSqlGenerated: (sql: string) => void;
	} = $props();

	interface ChatMessage {
		role: 'user' | 'assistant';
		content: string;
		sql?: string;
	}

	let messages: ChatMessage[] = $state([]);
	let inputValue = $state('');
	let loading = $state(false);
	let error = $state('');
	let schemas: TableSchema[] = $state([]);
	let schemasLoaded = $state(false);
	let llmAvailable = $state(true);
	let chatContainer: HTMLDivElement | undefined = $state();

	let parameters = $derived($pipelineStore.pipeline?.parameters ?? []);
	let currentQuery = $derived($pipelineStore.pipeline?.query ?? null);

	onMount(async () => {
		try {
			const status = await api.llm.status();
			llmAvailable = status.status === 'ok';
		} catch {
			llmAvailable = false;
		}
	});

	async function loadSchemas() {
		if (schemasLoaded) return;
		const sources = $pipelineStore.pipeline?.sources ?? [];
		try {
			const results = await Promise.all(
				sources.map(async (s) => {
					try {
						const schema = await api.sources.schema(pipelineId, s.id);
						return { name: s.table_name, columns: schema.columns };
					} catch {
						return { name: s.table_name, columns: [] };
					}
				})
			);
			schemas = results;
			schemasLoaded = true;
		} catch {
			// schemas will remain empty; LLM can still generate SQL without them
		}
	}

	async function sendMessage() {
		const prompt = inputValue.trim();
		if (!prompt || loading) return;

		await loadSchemas();

		inputValue = '';
		error = '';
		messages = [...messages, { role: 'user', content: prompt }];
		loading = true;
		scrollToBottom();

		try {
			// Build conversation history (without the current message)
			const history = messages.slice(0, -1).map((m) => ({
				role: m.role,
				content: m.role === 'assistant' && m.sql ? `\`\`\`sql\n${m.sql}\n\`\`\`\n\nExplanation: ${m.content}` : m.content
			}));

			const result = await api.llm.generateSql({
				prompt,
				available_tables: schemas,
				pipeline_parameters: parameters as PipelineParameter[],
				conversation_history: history.length > 0 ? history : [],
				current_query: currentQuery
			});

			messages = [
				...messages,
				{ role: 'assistant', content: result.explanation || 'Query updated.', sql: result.sql }
			];

			onSqlGenerated(result.sql);
		} catch (e) {
			if (e instanceof ApiError) {
				error = e.detail;
			} else {
				error = 'Failed to generate SQL. Please try again.';
			}
		} finally {
			loading = false;
			scrollToBottom();
		}
	}

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		});
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
</script>

<div class="flex h-full flex-col" data-testid="llm-chat">
	<!-- Header -->
	<div class="border-b border-gray-200 px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Assistant</h3>
	</div>

	{#if !llmAvailable}
		<div class="flex flex-1 items-center justify-center p-4">
			<p class="text-center text-sm text-gray-500">
				AI assistant unavailable. Configure ANTHROPIC_API_KEY to enable SQL generation.
			</p>
		</div>
	{:else}
		<!-- Chat messages -->
		<div bind:this={chatContainer} class="flex-1 overflow-y-auto p-3">
			{#if messages.length === 0}
				<p class="text-sm text-gray-400">
					Describe the transformation you need and I'll generate DuckDB SQL for you.
				</p>
			{/if}

			{#each messages as msg}
				<div class="mb-3">
					{#if msg.role === 'user'}
						<div class="flex justify-end">
							<div class="max-w-[85%] rounded-lg bg-blue-50 px-3 py-2 text-sm text-gray-800">
								{msg.content}
							</div>
						</div>
					{:else}
						<div class="max-w-[85%]">
							<p class="text-sm text-gray-600">{msg.content}</p>
						</div>
					{/if}
				</div>
			{/each}

			{#if loading}
				<div class="mb-3">
					<div class="flex items-center gap-2 text-sm text-gray-400">
						<svg
							class="h-4 w-4 animate-spin"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
							<path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
						</svg>
						Generating SQL...
					</div>
				</div>
			{/if}

			{#if error}
				<div class="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
					{error}
				</div>
			{/if}
		</div>

		<!-- Input -->
		<div class="border-t border-gray-200 p-2">
			<div class="flex gap-2">
				<textarea
					class="flex-1 resize-none rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
					rows="2"
					placeholder="Describe your query..."
					bind:value={inputValue}
					onkeydown={handleKeydown}
					disabled={loading}
				></textarea>
				<button
					class="self-end rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
					onclick={sendMessage}
					disabled={loading || !inputValue.trim()}
				>
					Send
				</button>
			</div>
		</div>
	{/if}
</div>
