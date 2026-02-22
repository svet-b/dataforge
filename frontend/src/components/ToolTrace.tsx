import { useState } from 'react';
import type { AgentToolStep } from '@/types';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

function formatToolResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
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

export default function ToolTrace({ steps }: { steps: AgentToolStep[] }) {
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
