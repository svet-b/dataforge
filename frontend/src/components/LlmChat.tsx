import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/api/client';
import { useWorkflowStore } from '@/stores/workflow';
import type { TableSchema, WorkflowParameter } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

const MAX_VALIDATION_RETRIES = 2;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
}

interface LlmChatProps {
  workflowId: string;
  onSqlGenerated: (sql: string) => void;
}

export default function LlmChat({ workflowId, onSqlGenerated }: LlmChatProps) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Generating SQL...');
  const [error, setError] = useState('');
  const [schemas, setSchemas] = useState<TableSchema[]>([]);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const parameters = workflow?.parameters ?? [];
  const currentQuery = workflow?.query ?? null;

  useEffect(() => {
    api.llm.status().then((status) => {
      setLlmAvailable(status.status === 'ok');
    }).catch(() => setLlmAvailable(false));
  }, []);

  const loadSchemas = useCallback(async (): Promise<TableSchema[]> => {
    if (schemasLoaded) return schemas;
    const sources = workflow?.sources ?? [];
    try {
      const results = await Promise.all(
        sources.map(async (s) => {
          try {
            const schema = await api.sources.schema(workflowId, s.id);
            return { name: s.table_name, columns: schema.columns };
          } catch {
            return { name: s.table_name, columns: [] };
          }
        }),
      );
      setSchemas(results);
      setSchemasLoaded(true);
      return results;
    } catch {
      // schemas will remain empty; LLM can still generate SQL without them
      return schemas;
    }
  }, [schemasLoaded, schemas, workflow?.sources, workflowId]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }

  function buildHistory(msgs: ChatMessage[]) {
    return msgs.map((m) => ({
      role: m.role,
      content: m.role === 'assistant' && m.sql ? `\`\`\`sql\n${m.sql}\n\`\`\`\n\nExplanation: ${m.content}` : m.content,
    }));
  }

  async function sendMessage() {
    const prompt = inputValue.trim();
    if (!prompt || loading) return;

    const loadedSchemas = await loadSchemas();

    setInputValue('');
    setError('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
    setMessages(newMessages);
    setLoading(true);
    setLoadingText('Generating SQL...');
    scrollToBottom();

    try {
      const history = buildHistory(newMessages.slice(0, -1));

      const result = await api.llm.generateSql({
        prompt,
        available_tables: loadedSchemas,
        workflow_parameters: parameters as WorkflowParameter[],
        conversation_history: history.length > 0 ? history : [],
        current_query: currentQuery,
      });

      let finalSql = result.sql;
      let finalExplanation = result.explanation || 'Query updated.';

      // Validate the generated SQL and auto-retry if it has errors
      const validated = await validateAndRetry(
        finalSql,
        finalExplanation,
        newMessages,
        loadedSchemas,
        parameters as WorkflowParameter[],
        currentQuery,
      );
      finalSql = validated.sql;
      finalExplanation = validated.explanation;

      setMessages([
        ...newMessages,
        { role: 'assistant', content: finalExplanation, sql: finalSql },
      ]);

      onSqlGenerated(finalSql);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.detail);
      } else {
        setError('Failed to generate SQL. Please try again.');
      }
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }

  async function validateAndRetry(
    sql: string,
    explanation: string,
    conversationMessages: ChatMessage[],
    availableTables: TableSchema[],
    workflowParams: WorkflowParameter[],
    query: string | null,
  ): Promise<{ sql: string; explanation: string }> {
    for (let attempt = 0; attempt < MAX_VALIDATION_RETRIES; attempt++) {
      setLoadingText('Validating query...');
      scrollToBottom();

      let validation;
      try {
        validation = await api.execution.validateQuery(workflowId, sql);
      } catch {
        // If validation endpoint itself fails, accept the query as-is
        return { sql, explanation };
      }

      if (validation.valid) {
        return { sql, explanation };
      }

      // Query is invalid — ask the LLM to fix it
      setLoadingText(`Query error detected, asking AI to fix (attempt ${attempt + 1}/${MAX_VALIDATION_RETRIES})...`);
      scrollToBottom();

      const retryHistory = buildHistory([
        ...conversationMessages,
        { role: 'assistant', content: explanation, sql },
      ]);

      const tableNames = availableTables.map((t) => t.name).join(', ');
      const fixPrompt =
        `The query you generated has an error when validated against the data sources:\n\n` +
        `Error: ${validation.error}\n\n` +
        `Available tables: ${tableNames}\n\n` +
        `Please fix the query and return the corrected full SQL.`;

      const retryResult = await api.llm.generateSql({
        prompt: fixPrompt,
        available_tables: availableTables,
        workflow_parameters: workflowParams,
        conversation_history: retryHistory,
        current_query: query,
      });

      sql = retryResult.sql;
      explanation = retryResult.explanation || 'Query corrected.';
    }

    // After max retries, accept whatever we have
    return { sql, explanation };
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="llm-chat">
      {/* Header */}
      <div className="border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Assistant</h3>
      </div>

      {!llmAvailable ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-center text-sm text-gray-500">
            AI assistant unavailable. Configure ANTHROPIC_API_KEY to enable SQL generation.
          </p>
        </div>
      ) : (
        <>
          {/* Chat messages */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400">
                Describe the transformation you need and I'll generate DuckDB SQL for you.
              </p>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="mb-3">
                {msg.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-lg bg-blue-50 px-3 py-2 text-sm text-gray-800">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%]">
                    <p className="text-sm text-gray-600">{msg.content}</p>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="mb-3">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingText}
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 p-2">
            <div className="flex gap-2">
              <Textarea
                className="flex-1 resize-none text-sm"
                rows={2}
                placeholder="Describe your query..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <Button
                className="self-end"
                size="sm"
                onClick={sendMessage}
                disabled={loading || !inputValue.trim()}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
