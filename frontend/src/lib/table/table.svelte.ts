import {
	createTable,
	type RowData,
	type TableOptions,
	type TableOptionsResolved,
	type TableState,
} from '@tanstack/table-core';

function mergeObjects<T>(...sources: (Partial<T> | undefined)[]): T {
	const result = {} as T;
	for (const source of sources) {
		if (!source) continue;
		for (const key of Object.keys(source) as (keyof T)[]) {
			const val = source[key];
			if (val !== undefined) {
				(result as any)[key] = val;
			}
		}
	}
	return result;
}

export function createSvelteTable<TData extends RowData>(options: TableOptions<TData>) {
	const resolvedOptions: TableOptionsResolved<TData> = mergeObjects(
		{
			state: {},
			onStateChange() {},
			renderFallbackValue: null,
			mergeOptions: (
				defaultOptions: TableOptions<TData>,
				options: Partial<TableOptions<TData>>
			) => {
				return mergeObjects(defaultOptions, options);
			},
		},
		options
	);

	const table = createTable(resolvedOptions);
	let state = $state<Partial<TableState>>(table.initialState);

	function updateOptions() {
		table.setOptions((prev) => {
			return mergeObjects(prev, options, {
				state: mergeObjects(state, options.state || {}),
				onStateChange: (updater: any) => {
					if (updater instanceof Function) state = updater(state);
					else state = mergeObjects(state, updater);
					options.onStateChange?.(updater);
				},
			});
		});
	}

	updateOptions();

	$effect.pre(() => {
		updateOptions();
	});

	return table;
}
