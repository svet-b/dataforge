import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/api/client';
import { usePipelineStore } from '@/stores/pipeline';
import type { TableSchema, PipelineParameter } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
}

interface LlmChatProps {
  pipelineId: string;
  onSqlGenerated: (sql: string) => void;
}

export default function LlmChat({ pipelineId, onSqlGenerated }: LlmChatProps) {
  const pipeline = usePipelineStore((s) => s.pipeline);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schemas, setSchemas] = useState<TableSchema[]>([]);
  const [schemasLoaded, setSchemasLoaded] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const parameters = pipeline?.parameters ?? [];
  const currentQuery = pipeline?.query ?? null;

  useEffect(() => {
    api.llm.status().then((status) => {
      setLlmAvailable(status.status === 'ok');
    }).catch(() => setLlmAvailable(false));
  }, []);

  const loadSchemas = useCallback(async () => {
    if (schemasLoaded) return;
    const sources = pipeline?.sources ?? [];
    try {
      const results = await Promise.all(
        sources.map(async (s) => {
          try {
            const schema = await api.sources.schema(pipelineId, s.id);
            return { name: s.table_name, columns: schema.columns };
          } catch {
            return { name: s.table_name, columns: [] };
          }
        }),
      );
      setSchemas(results);
      setSchemasLoaded(true);
    } catch {
      // schemas will remain empty; LLM can still generate SQL without them
    }
  }, [schemasLoaded, pipeline?.sources, pipelineId]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }

  async function sendMessage() {
    const prompt = inputValue.trim();
    if (!prompt || loading) return;

    await loadSchemas();

    setInputValue('');
    setError('');
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
    setMessages(newMessages);
    setLoading(true);
    scrollToBottom();

    try {
      const history = newMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.sql ? `\`\`\`sql\n${m.sql}\n\`\`\`\n\nExplanation: ${m.content}` : m.content,
      }));

      const result = await api.llm.generateSql({
        prompt,
        available_tables: schemas,
        pipeline_parameters: parameters as PipelineParameter[],
        conversation_history: history.length > 0 ? history : [],
        current_query: currentQuery,
      });

      setMessages([
        ...newMessages,
        { role: 'assistant', content: result.explanation || 'Query updated.', sql: result.sql },
      ]);

      onSqlGenerated(result.sql);
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
                  Generating SQL...
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
