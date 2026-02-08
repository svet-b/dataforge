import { writable } from 'svelte/store';

export interface Toast {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
}

let nextId = 0;

const { subscribe, update } = writable<Toast[]>([]);

export const toasts = { subscribe };

export function addToast(message: string, type: Toast['type'] = 'info') {
	const id = nextId++;
	update((t) => [...t, { id, message, type }]);
	setTimeout(() => {
		update((t) => t.filter((toast) => toast.id !== id));
	}, 4000);
}
