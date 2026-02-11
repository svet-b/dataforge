<script lang="ts">
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
	import type { SchemaColumn } from '$lib/types/index.js';

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

	let {
		data,
		schema,
	}: {
		data: RowData[];
		schema: SchemaColumn[];
	} = $props();

	const NUMERIC_TYPE_RE = /^(INTEGER|BIGINT|SMALLINT|TINYINT|HUGEINT|FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|INT|UBIGINT|UINTEGER|USMALLINT|UTINYINT)/i;
	const STRING_DATE_RE = /^(VARCHAR|TEXT|STRING|CHAR|DATE|TIMESTAMP|DATETIME|TIME)/i;

	function isNumericType(type: string): boolean {
		return NUMERIC_TYPE_RE.test(type);
	}

	function isStringOrDateType(type: string): boolean {
		return STRING_DATE_RE.test(type);
	}

	// Detect columns by type
	let numericColumns = $derived(schema.filter((c) => isNumericType(c.type)));
	let labelColumns = $derived(schema.filter((c) => isStringOrDateType(c.type)));

	// Auto-detect defaults
	let defaultXAxis = $derived(labelColumns.length > 0 ? labelColumns[0].name : null);
	let hasNumericData = $derived(numericColumns.length > 0 && data.length > 0);

	// User-controlled state
	let selectedXAxis = $state<string | null>(null);
	let enabledSeries = $state<Set<string>>(new Set());
	let chartType = $state<ChartType>('bar');
	let initialized = $state(false);

	// Reset selections when schema changes
	$effect(() => {
		// Reference schema to track changes
		const _cols = schema.map((c) => c.name).join(',');
		selectedXAxis = null;
		enabledSeries = new Set(numericColumns.map((c) => c.name));
		initialized = true;
	});

	let xAxis = $derived(selectedXAxis ?? defaultXAxis);

	// Palette of distinct colors
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

	// Build chart data
	let chartData = $derived.by(() => {
		if (!hasNumericData || !initialized) return null;

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
	});

	// Canvas element and chart instance
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let chartInstance: Chart | null = null;

	function createOrUpdateChart() {
		if (!canvasEl || !chartData) {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
			return;
		}

		if (chartInstance) {
			chartInstance.data.labels = chartData.labels;
			chartInstance.data.datasets = chartData.datasets;
			(chartInstance.config as any).type = chartType;
			chartInstance.update();
		} else {
			chartInstance = new Chart(canvasEl, {
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
						x: {
							ticks: { maxRotation: 45, font: { size: 10 } },
						},
						y: {
							beginAtZero: true,
							ticks: { font: { size: 10 } },
						},
					},
				},
			});
		}
	}

	// React to data/config changes
	$effect(() => {
		// Track all reactive deps
		const _cd = chartData;
		const _ct = chartType;
		const _cv = canvasEl;

		// Need to check if chart type changed — destroy and recreate
		if (chartInstance && (chartInstance.config as any).type !== chartType) {
			chartInstance.destroy();
			chartInstance = null;
		}

		createOrUpdateChart();
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
		};
	});

	function toggleSeries(colName: string) {
		const next = new Set(enabledSeries);
		if (next.has(colName)) {
			next.delete(colName);
		} else {
			next.add(colName);
		}
		enabledSeries = next;
	}
</script>

<div class="flex h-full flex-col overflow-hidden">
	{#if !hasNumericData}
		<div class="flex h-full items-center justify-center text-sm text-gray-400">
			No numeric data to visualize.
		</div>
	{:else}
		<!-- Chart controls -->
		<div class="flex shrink-0 flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-3 py-1.5">
			<!-- Chart type -->
			<div class="flex items-center gap-1.5">
				<span class="text-xs text-gray-500">Type:</span>
				<select
					class="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
					bind:value={chartType}
				>
					<option value="bar">Bar</option>
					<option value="line">Line</option>
				</select>
			</div>

			<!-- X-axis selector -->
			<div class="flex items-center gap-1.5">
				<span class="text-xs text-gray-500">X-axis:</span>
				<select
					class="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
					value={xAxis ?? ''}
					onchange={(e) => {
						const val = (e.target as HTMLSelectElement).value;
						selectedXAxis = val || null;
					}}
				>
					<option value="">(row index)</option>
					{#each schema as col}
						<option value={col.name}>{col.name}</option>
					{/each}
				</select>
			</div>

			<!-- Series toggles -->
			<div class="flex items-center gap-1">
				<span class="text-xs text-gray-500">Series:</span>
				{#each numericColumns as col, idx}
					<button
						class="rounded px-1.5 py-0.5 text-xs transition-colors {enabledSeries.has(col.name)
							? 'text-white'
							: 'bg-gray-100 text-gray-400'}"
						style={enabledSeries.has(col.name) ? `background-color: ${PALETTE[idx % PALETTE.length]}` : ''}
						onclick={() => toggleSeries(col.name)}
					>
						{col.name}
					</button>
				{/each}
			</div>
		</div>

		<!-- Chart canvas -->
		<div class="min-h-0 flex-1 p-2">
			<canvas bind:this={canvasEl}></canvas>
		</div>
	{/if}
</div>
