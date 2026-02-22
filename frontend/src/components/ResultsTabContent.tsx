import { useResultsStore } from '@/stores/results';
import DataTable from '@/components/DataTable';
import { Loader2 } from 'lucide-react';

export default function ResultsTabContent() {
  const results = useResultsStore();

  if (results.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Running query...
      </div>
    );
  }

  if (results.error) {
    return <div className="m-3 rounded bg-red-50 p-3 text-sm text-red-600">{results.error}</div>;
  }

  if (results.data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No results yet. Click Run to execute the workflow.
      </div>
    );
  }

  return <DataTable data={results.data} schema={results.schema} />;
}
