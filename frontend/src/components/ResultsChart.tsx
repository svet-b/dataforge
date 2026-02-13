import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Colors,
} from 'chart.js';
import type { SchemaColumn } from '@/types';

Chart.register(
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Colors,
);

type RowData = Record<string, unknown>;
type ChartType = 'bar' | 'line';

interface ResultsChartProps {
  data: RowData[];
  schema: SchemaColumn[];
}

const NUMERIC_TYPE_RE = /^(INTEGER|BIGINT|SMALLINT|TINYINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|INT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/i;
const STRING_DATE_RE = /^(VARCHAR|TEXT|STRING|CHAR|DATE|TIMESTAMP|DATETIME|TIME)/i;

const PALETTE = [
  'rgba(54, 162, 235, 0.7)',
  'rgba(255, 99, 132, 0.7)',
  'rgba(75, 192, 192, 0.7)',
  'rgba(255, 206, 86, 0.7)',
  'rgba(153, 102, 255, 0.7)',
  'rgba(255, 159, 64, 0.7)',
  'rgba(99, 255, 132, 0.7)',
  'rgba(201, 203, 207, 0.7)',
];

const BORDER_PALETTE = PALETTE.map((c) => c.replace('0.7)', '1)'));

export default function ResultsChart({ data, schema }: ResultsChartProps) {
  const numericColumns = useMemo(() => schema.filter((c) => NUMERIC_TYPE_RE.test(c.type)), [schema]);
  const labelColumns = useMemo(() => schema.filter((c) => STRING_DATE_RE.test(c.type)), [schema]);

  const defaultXAxis = labelColumns.length > 0 ? labelColumns[0].name : null;
  const hasNumericData = numericColumns.length > 0 && data.length > 0;

  const [selectedXAxis, setSelectedXAxis] = useState<string | null>(null);
  const [enabledSeries, setEnabledSeries] = useState<Set<string>>(new Set());
  const [chartType, setChartType] = useState<ChartType>('bar');

  // Reset selections when schema changes
  const schemaKey = schema.map((c) => c.name).join(',');
  useEffect(() => {
    setSelectedXAxis(null);
    setEnabledSeries(new Set(numericColumns.map((c) => c.name)));
  }, [schemaKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const xAxis = selectedXAxis ?? defaultXAxis;

  const chartData = useMemo(() => {
    if (!hasNumericData) return null;

    const labels = xAxis
      ? data.map((row) => String(row[xAxis] ?? ''))
      : data.map((_, i) => String(i + 1));

    const activeSeries = numericColumns.filter((c) => enabledSeries.has(c.name));

    const datasets = activeSeries.map((col, idx) => ({
      label: col.name,
      data: data.map((row) => {
        const v = row[col.name];
        return typeof v === 'number' ? v : null;
      }),
      backgroundColor: PALETTE[idx % PALETTE.length],
      borderColor: BORDER_PALETTE[idx % BORDER_PALETTE.length],
      borderWidth: 1,
    }));

    return { labels, datasets };
  }, [data, numericColumns, enabledSeries, xAxis, hasNumericData]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !chartData) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
      return;
    }

    if (chartInstanceRef.current) {
      // If chart type changed, destroy and recreate
      if ((chartInstanceRef.current.config as any).type !== chartType) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      } else {
        chartInstanceRef.current.data.labels = chartData.labels;
        chartInstanceRef.current.data.datasets = chartData.datasets;
        chartInstanceRef.current.update();
        return;
      }
    }

    chartInstanceRef.current = new Chart(canvasRef.current, {
      type: chartType,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: { boxWidth: 12, padding: 8, font: { size: 11 } },
          },
          tooltip: { enabled: true },
        },
        scales: {
          x: { ticks: { maxRotation: 45, font: { size: 10 } } },
          y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        },
      },
    });

    return () => {
      // Don't destroy on every re-render — only on unmount or type change
    };
  }, [chartData, chartType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  function toggleSeries(colName: string) {
    setEnabledSeries((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) next.delete(colName);
      else next.add(colName);
      return next;
    });
  }

  if (!hasNumericData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No numeric data to visualize.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Chart controls */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Type:</span>
          <select
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
          >
            <option value="bar">Bar</option>
            <option value="line">Line</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">X-axis:</span>
          <select
            className="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
            value={xAxis ?? ''}
            onChange={(e) => setSelectedXAxis(e.target.value || null)}
          >
            <option value="">(row index)</option>
            {schema.map((col) => (
              <option key={col.name} value={col.name}>{col.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500">Series:</span>
          {numericColumns.map((col, idx) => (
            <button
              key={col.name}
              className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                enabledSeries.has(col.name) ? 'text-white' : 'bg-gray-100 text-gray-400'
              }`}
              style={enabledSeries.has(col.name) ? { backgroundColor: PALETTE[idx % PALETTE.length] } : {}}
              onClick={() => toggleSeries(col.name)}
            >
              {col.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="min-h-0 flex-1 p-2">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
