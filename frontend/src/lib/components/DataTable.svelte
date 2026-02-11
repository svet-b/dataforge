<script lang="ts">
	import {
		createSvelteTable,
		getCoreRowModel,
		getSortedRowModel,
		type ColumnDef,
		type SortingState,
		type ColumnSizingState,
	} from '$lib/table/index.js';
	import type { SchemaColumn } from '$lib/types/index.js';

	type RowData = Record<string, unknown>;

	let {
		data,
		schema,
	}: {
		data: RowData[];
		schema: SchemaColumn[];
	} = $props();

	// --- Number formatting ---

	const NUMERIC_TYPE_RE = /^(INTEGER|BIGINT|SMALLINT|TINYINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|INT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/i;

	function isNumericColumn(type: string): boolean {
		return NUMERIC_TYPE_RE.test(type);
	}

	/** Determine the maximum decimal places actually present in a column's data. */
	function getColumnPrecision(colName: string, rows: RowData[]): number {
		let maxDecimals = 0;
		for (const row of rows) {
			const v = row[colName];
			if (typeof v === 'number' && isFinite(v)) {
				const s = String(v);
				const dot = s.indexOf('.');
				if (dot !== -1) {
					maxDecimals = Math.max(maxDecimals, s.length - dot - 1);
				}
			}
		}
		return maxDecimals;
	}

	/** Build a map of column name -> decimal precision for numeric columns. */
	let precisionMap = $derived.by(() => {
		const map = new Map<string, number>();
		for (const col of schema) {
			if (isNumericColumn(col.type)) {
				map.set(col.name, getColumnPrecision(col.name, data));
			}
		}
		return map;
	});

	function formatCell(value: unknown, colName: string): string {
		if (value == null) return '';
		if (typeof value === 'number') {
			const precision = precisionMap.get(colName);
			if (precision !== undefined) {
				return value.toFixed(precision);
			}
			return String(value);
		}
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	// --- Auto-size column widths ---

	/** Estimate column width based on content (header + data). */
	function estimateColumnWidth(colName: string, colType: string, rows: RowData[]): number {
		const CHAR_WIDTH = 7.5; // approx monospace char width at text-xs
		const PADDING = 24; // px padding
		const MIN_WIDTH = 60;
		const MAX_WIDTH = 400;

		// Header width: name + type
		let maxLen = colName.length + colType.length + 2;

		// Sample first 50 rows for width estimation
		const sample = rows.slice(0, 50);
		for (const row of sample) {
			const v = row[colName];
			const formatted = formatCell(v, colName);
			maxLen = Math.max(maxLen, formatted.length);
		}

		const width = Math.round(maxLen * CHAR_WIDTH + PADDING);
		return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
	}

	// --- TanStack Table setup ---

	let sorting = $state<SortingState>([]);
	let columnSizing = $state<ColumnSizingState>({});

	let columns = $derived<ColumnDef<RowData, unknown>[]>(
		schema.map((col) => {
			const numeric = isNumericColumn(col.type);
			return {
				accessorKey: col.name,
				id: col.name,
				header: () => col.name,
				cell: (info) => formatCell(info.getValue(), col.name),
				size: estimateColumnWidth(col.name, col.type, data),
				minSize: 40,
				meta: { type: col.type, numeric },
			};
		})
	);

	let table = createSvelteTable({
		get data() { return data; },
		get columns() { return columns; },
		state: {
			get sorting() { return sorting; },
			get columnSizing() { return columnSizing; },
		},
		onSortingChange(updater) {
			if (updater instanceof Function) sorting = updater(sorting);
			else sorting = updater;
		},
		onColumnSizingChange(updater) {
			if (updater instanceof Function) columnSizing = updater(columnSizing);
			else columnSizing = updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		columnResizeMode: 'onChange',
		enableColumnResizing: true,
		enableSorting: true,
	});

	// --- Resize state ---

	let isResizing = $derived(table.getState().columnSizingInfo.isResizingColumn !== false);
</script>

<div class="datatable-wrapper flex flex-col overflow-hidden" style="height: 100%;">
	<!-- Scrollable table area: header scrolls with body horizontally, but header stays at top -->
	<div class="flex-1 overflow-auto" style="min-height: 0;">
		<table
			class="border-collapse font-mono text-xs"
			style="width: {table.getCenterTotalSize()}px; min-width: 100%;"
		>
			<thead>
				{#each table.getHeaderGroups() as headerGroup}
					<tr class="sticky top-0 z-10 bg-gray-50">
						{#each headerGroup.headers as header}
							{@const sorted = header.column.getIsSorted()}
							{@const meta = header.column.columnDef.meta as { type: string; numeric: boolean } | undefined}
							<th
								class="relative select-none border-b border-r border-gray-200 px-2 py-1.5 text-left font-semibold
									{header.column.getCanSort() ? 'cursor-pointer hover:bg-gray-100' : ''}"
								style="width: {header.getSize()}px;"
								onclick={header.column.getToggleSortingHandler()}
							>
								<span class="text-gray-800">{header.column.columnDef.id}</span>
								{#if meta}
									<span class="ml-1 text-gray-400">{meta.type}</span>
								{/if}
								{#if sorted === 'asc'}
									<span class="ml-0.5">&#9650;</span>
								{:else if sorted === 'desc'}
									<span class="ml-0.5">&#9660;</span>
								{/if}

								<!-- Resize handle -->
								{#if header.column.getCanResize()}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<div
										class="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none touch-none
											{header.column.getIsResizing() ? 'bg-blue-500 opacity-100' : 'opacity-0 hover:opacity-100 bg-gray-300'}"
										onmousedown={header.getResizeHandler()}
										ontouchstart={header.getResizeHandler()}
										role="separator"
									></div>
								{/if}
							</th>
						{/each}
					</tr>
				{/each}
			</thead>
			<tbody>
				{#each table.getRowModel().rows as row, i}
					<tr class={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
						{#each row.getVisibleCells() as cell}
							{@const meta = cell.column.columnDef.meta as { type: string; numeric: boolean } | undefined}
							<td
								class="border-r border-gray-100 px-2 py-1 text-gray-700 whitespace-nowrap overflow-hidden text-ellipsis
									{meta?.numeric ? 'text-right tabular-nums' : ''}"
								style="width: {cell.column.getSize()}px; max-width: {cell.column.getSize()}px;"
							>
								{cell.renderValue() as string}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	/* Ensure resize cursor stays while dragging */
	.datatable-wrapper :global(body.col-resizing) {
		cursor: col-resize !important;
		user-select: none !important;
	}
</style>
