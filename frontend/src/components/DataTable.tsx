import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnSizingState,
} from '@tanstack/react-table';
import type { SchemaColumn } from '@/types';

type RowData = Record<string, unknown>;

interface DataTableProps {
  data: RowData[];
  schema: SchemaColumn[];
}

const NUMERIC_TYPE_RE = /^(INTEGER|BIGINT|SMALLINT|TINYINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|INT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/i;

function isNumericColumn(type: string): boolean {
  return NUMERIC_TYPE_RE.test(type);
}

const MAX_SIG_FIGS = 10;

function roundToSigFigs(v: number): number {
  if (v === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(v))) + 1;
  const decimals = Math.max(0, MAX_SIG_FIGS - magnitude);
  return parseFloat(v.toFixed(decimals));
}

function getColumnPrecision(colName: string, rows: RowData[]): number {
  let maxDecimals = 0;
  for (const row of rows) {
    const v = row[colName];
    if (typeof v === 'number' && isFinite(v)) {
      const rounded = roundToSigFigs(v);
      const s = String(rounded);
      const dot = s.indexOf('.');
      if (dot !== -1) {
        maxDecimals = Math.max(maxDecimals, s.length - dot - 1);
      }
    }
  }
  return maxDecimals;
}

function formatCell(value: unknown, colName: string, precisionMap: Map<string, number>): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    const precision = precisionMap.get(colName);
    if (precision !== undefined) {
      return roundToSigFigs(value).toFixed(precision);
    }
    return String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function estimateColumnWidth(colName: string, colType: string, rows: RowData[], precisionMap: Map<string, number>): number {
  const CHAR_WIDTH = 7.5;
  const PADDING = 24;
  const MIN_WIDTH = 60;
  const MAX_WIDTH = 400;

  let maxLen = Math.max(colName.length, colType.length);
  const sample = rows.slice(0, 50);
  for (const row of sample) {
    const v = row[colName];
    const formatted = formatCell(v, colName, precisionMap);
    maxLen = Math.max(maxLen, formatted.length);
  }

  const width = Math.round(maxLen * CHAR_WIDTH + PADDING);
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
}

export default function DataTable({ data, schema }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});

  const precisionMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const col of schema) {
      if (isNumericColumn(col.type)) {
        map.set(col.name, getColumnPrecision(col.name, data));
      }
    }
    return map;
  }, [schema, data]);

  const columns = useMemo<ColumnDef<RowData, unknown>[]>(
    () =>
      schema.map((col) => {
        const numeric = isNumericColumn(col.type);
        return {
          accessorKey: col.name,
          id: col.name,
          header: () => col.name,
          cell: (info) => formatCell(info.getValue(), col.name, precisionMap),
          size: estimateColumnWidth(col.name, col.type, data, precisionMap),
          minSize: 40,
          meta: { type: col.type, numeric },
        };
      }),
    [schema, data, precisionMap],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableSorting: true,
  });

  const centerTotalSize = table.getCenterTotalSize();

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100%' }}>
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        <table
          className="border-collapse font-mono text-xs"
          style={{ tableLayout: 'fixed', width: `${centerTotalSize}px`, minWidth: '100%' }}
        >
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="sticky top-0 z-10 bg-gray-50">
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const meta = header.column.columnDef.meta as { type: string; numeric: boolean } | undefined;
                  return (
                    <th
                      key={header.id}
                      className={`relative select-none border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold ${
                        header.column.getCanSort() ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      style={{ width: `${header.column.getSize()}px` }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-baseline gap-1">
                        <span className="text-gray-800">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                        {sorted === 'asc' && <span className="ml-0.5">&#9650;</span>}
                        {sorted === 'desc' && <span className="ml-0.5">&#9660;</span>}
                      </div>
                      {meta && (
                        <div className="text-[10px] font-normal text-gray-400">{meta.type}</div>
                      )}
                      {header.column.getCanResize() && (
                        <div
                          className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none ${
                            header.column.getIsResizing()
                              ? 'bg-blue-500 opacity-100'
                              : 'bg-gray-300 opacity-0 hover:opacity-100'
                          }`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          role="separator"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { type: string; numeric: boolean } | undefined;
                  return (
                    <td
                      key={cell.id}
                      className={`overflow-hidden text-ellipsis whitespace-nowrap border-r border-gray-100 px-2 py-1 text-gray-700 ${
                        meta?.numeric ? 'tabular-nums text-right' : ''
                      }`}
                      style={{ width: `${cell.column.getSize()}px`, maxWidth: `${cell.column.getSize()}px` }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
