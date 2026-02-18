import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { streamAgentChat } from '@/api/client';
import { useWorkflowStore } from '@/stores/workflow';
import type { AgentMessage, AgentToolStep } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronRight, Loader2, Square } from 'lucide-react';

interface LlmChatProps {
  workflowId: string;
  onSqlGenerated: (sql: string) => void;
}

export default function LlmChat({ workflowId, onSqlGenerated }: LlmChatProps) {
  const workflow = useWorkflowStore((s) => s.workflow);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTool, setCurrentTool] = useState<string | null>(null);
  const [pendingSteps, setPendingSteps] = useState<AgentToolStep[]>([]);
  const [llmAvailable, setLlmAvailable] = useState(true);
  const [lastResult, setLastResult] = useState<{ sql: string; explanation: string } | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const currentQuery = workflow?.query ?? null;

  useEffect(() => {
    api.llm.status().then((status) => {
      setLlmAvailable(status.status === 'ok');
    }).catch(() => setLlmAvailable(false));
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });
  }, []);

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setCurrentTool(null);
  }

  function sendMessage() {
    const prompt = inputValue.trim();
    if (!prompt || loading) return;

    setInputValue('');
    const userMsg: AgentMessage = { role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setCurrentTool(null);
    setPendingSteps([]);
    scrollToBottom();

    // Build conversation summary from last result
    let conversationSummary: string | null = null;
    if (lastResult) {
      conversationSummary =
        `Previous SQL:\n\`\`\`sql\n${lastResult.sql}\n\`\`\`\n\n` +
        `Explanation: ${lastResult.explanation}`;
    }

    const steps: AgentToolStep[] = [];
    let thinkingText = '';

    const controller = streamAgentChat(
      workflowId,
      {
        prompt,
        conversation_summary: conversationSummary,
        current_query: currentQuery,
      },
      {
        onToolCall: (event) => {
          setCurrentTool(event.tool);
          steps.push({
            tool: event.tool,
            input: event.input,
            iteration: event.iteration,
          });
          setPendingSteps([...steps]);
          scrollToBottom();
        },
        onToolResult: (event) => {
          const step = steps.find(
            (s) => s.tool === event.tool && s.result === undefined,
          );
          if (step) {
            step.result = event.result;
            step.duration_ms = event.duration_ms;
          }
          setCurrentTool(null);
          setPendingSteps([...steps]);
          scrollToBottom();
        },
        onThinking: (event) => {
          thinkingText = event.text;
          scrollToBottom();
        },
        onResult: (event) => {
          const assistantMsg: AgentMessage = {
            role: 'assistant',
            content: event.explanation,
            sql: event.sql,
            toolSteps: [...steps],
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setLastResult({ sql: event.sql, explanation: event.explanation });
          setLoading(false);
          setCurrentTool(null);
          setPendingSteps([]);
          onSqlGenerated(event.sql);
          scrollToBottom();
        },
        onError: (event) => {
          const errorMsg: AgentMessage = {
            role: 'assistant',
            content: event.message,
            toolSteps: steps.length > 0 ? [...steps] : undefined,
            isError: true,
          };
          setMessages((prev) => [...prev, errorMsg]);
          setLoading(false);
          setCurrentTool(null);
          setPendingSteps([]);
          scrollToBottom();
        },
      },
    );

    abortRef.current = controller;
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          AI Assistant
        </h3>
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
            {messages.length === 0 && !loading && (
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
                    {msg.toolSteps && msg.toolSteps.length > 0 && (
                      <ToolTrace steps={msg.toolSteps} />
                    )}
                    <p
                      className={`text-sm ${msg.isError ? 'text-red-600' : 'text-gray-600'}`}
                    >
                      {msg.content}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {/* Live loading state */}
            {loading && (
              <div className="mb-3">
                <div className="max-w-[85%]">
                  {pendingSteps.length > 0 && (
                    <ToolTrace steps={pendingSteps} />
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {currentTool
                      ? `Running ${currentTool}...`
                      : 'Thinking...'}
                  </div>
                </div>
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
              {loading ? (
                <Button
                  className="self-end"
                  size="sm"
                  variant="outline"
                  onClick={stopGeneration}
                >
                  <Square className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  className="self-end"
                  size="sm"
                  onClick={sendMessage}
                  disabled={!inputValue.trim()}
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ToolTrace({ steps }: { steps: AgentToolStep[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {steps.length} tool {steps.length === 1 ? 'call' : 'calls'}
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 border-l-2 border-gray-200 pl-3">
          {steps.map((step, i) => (
            <ToolStepItem key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolStepItem({ step }: { step: AgentToolStep }) {
  const [showResult, setShowResult] = useState(false);

  const inputSummary = Object.entries(step.input)
    .map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '...' : JSON.stringify(v)}`)
    .join(', ');

  return (
    <div className="text-xs">
      <div className="flex items-center gap-1 text-gray-500">
        <span className="font-medium text-gray-700">{step.tool}</span>
        {inputSummary && (
          <span className="truncate text-gray-400">({inputSummary})</span>
        )}
        {step.duration_ms !== undefined && (
          <span className="text-gray-300">{step.duration_ms}ms</span>
        )}
        {step.result === undefined && (
          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
        )}
      </div>
      {step.result !== undefined && (
        <button
          className="text-gray-400 hover:text-gray-600"
          onClick={() => setShowResult(!showResult)}
        >
          {showResult ? 'hide result' : 'show result'}
        </button>
      )}
      {showResult && step.result && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
          {formatToolResult(step.result)}
        </pre>
      )}
    </div>
  );
}

function formatToolResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
}
