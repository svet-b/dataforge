import RunHistory from '@/components/RunHistory';

interface ExecuteScreenProps {
  workflowId: string;
}

export default function ExecuteScreen({ workflowId }: ExecuteScreenProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 px-4 py-2">
        <h3 className="text-sm font-semibold text-gray-700">Run History</h3>
      </div>
      <div className="min-h-0 flex-1">
        <RunHistory workflowId={workflowId} />
      </div>
    </div>
  );
}
