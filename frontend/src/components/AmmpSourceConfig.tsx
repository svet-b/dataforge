import { useCallback, useEffect, useState } from 'react';
import type { SourceRawResponse } from '@/types';
import { api } from '@/api/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react';

interface AmmpSourceConfigProps {
  workflowId: string;
  sourceId: string;
  endpoint: string;
  assetId: string;
  dateFrom: string;
  dateTo: string;
  interval: string;
  onEndpointChange: (endpoint: string) => void;
  onAssetIdChange: (assetId: string) => void;
  onDateFromChange: (dateFrom: string) => void;
  onDateToChange: (dateTo: string) => void;
  onIntervalChange: (interval: string) => void;
  onFieldChange: () => void;
}

export default function AmmpSourceConfig({
  workflowId,
  sourceId,
  endpoint,
  assetId,
  dateFrom,
  dateTo,
  interval,
  onEndpointChange,
  onAssetIdChange,
  onDateFromChange,
  onDateToChange,
  onIntervalChange,
  onFieldChange,
}: AmmpSourceConfigProps) {
  const [rawData, setRawData] = useState<SourceRawResponse | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

  useEffect(() => {
    setRawData(null);
    setRawError(null);
    setRawLoading(false);
    setRawExpanded(false);
  }, [sourceId]);

  const fetchRawPreview = useCallback(async () => {
    setRawLoading(true);
    setRawError(null);
    setRawData(null);
    setRawExpanded(true);
    try {
      const result = await api.sources.fetchRaw(workflowId, sourceId);
      setRawData(result);
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Failed to fetch response');
    } finally {
      setRawLoading(false);
    }
  }, [workflowId, sourceId]);

  return (
    <>
      {/* Endpoint */}
      <div>
        <Label className="mb-1 block text-xs text-gray-600">Endpoint</Label>
        <Select
          value={endpoint}
          onValueChange={(v) => { onEndpointChange(v); onFieldChange(); }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="historic-energy">Historic Energy</SelectItem>
            <SelectItem value="financial-impact">Financial Impact</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Asset ID */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs text-gray-600">Asset ID</Label>
          {assetId && (
            <button
              className="flex items-center gap-1 text-xs text-blue-600 underline hover:text-blue-800 disabled:opacity-50"
              onClick={fetchRawPreview}
              disabled={rawLoading}
            >
              {rawLoading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Run Request
                </>
              )}
            </button>
          )}
        </div>
        <Input
          className="text-sm"
          value={assetId}
          onChange={(e) => { onAssetIdChange(e.target.value); onFieldChange(); }}
          placeholder={'{{asset_id}} or UUID'}
        />
      </div>

      {/* Date From */}
      <div>
        <Label className="mb-1 block text-xs text-gray-600">Date From</Label>
        <Input
          className="text-sm"
          value={dateFrom}
          onChange={(e) => { onDateFromChange(e.target.value); onFieldChange(); }}
          placeholder={'{{date_from}} or 2025-01-01'}
        />
      </div>

      {/* Date To */}
      <div>
        <Label className="mb-1 block text-xs text-gray-600">Date To</Label>
        <Input
          className="text-sm"
          value={dateTo}
          onChange={(e) => { onDateToChange(e.target.value); onFieldChange(); }}
          placeholder={'{{date_to}} or 2025-12-31'}
        />
      </div>

      {/* Interval */}
      <div>
        <Label className="mb-1 block text-xs text-gray-600">Interval</Label>
        <Select
          value={interval || '1h'}
          onValueChange={(v) => { onIntervalChange(v); onFieldChange(); }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15min">15 min</SelectItem>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="1d">1 day</SelectItem>
            <SelectItem value="1M">1 month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      {(rawData || rawError) && (
        <div className="pt-1">
          <button
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800"
            onClick={() => setRawExpanded(!rawExpanded)}
          >
            {rawExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Preview
            {rawData && (
              <span className="ml-1 font-normal text-gray-400">
                ({rawData.extracted_count} rows)
              </span>
            )}
          </button>
          {rawExpanded && (
            <div className="mt-1 space-y-2">
              {rawError ? (
                <p className="text-xs text-red-600">{rawError}</p>
              ) : rawData && rawData.extracted_records.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded border border-gray-200 bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {Object.keys(rawData.extracted_records[0]).map((col) => (
                          <th key={col} className="px-2 py-1 text-left font-medium text-gray-600">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawData.extracted_records.slice(0, 20).map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-2 py-1 text-gray-700">
                              {val === null ? <span className="text-gray-300">null</span> : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </>
  );
}
