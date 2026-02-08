<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
	import { EditorState } from '@codemirror/state';
	import { basicSetup } from 'codemirror';
	import { sql } from '@codemirror/lang-sql';

	let {
		value = $bindable(''),
		onRunPreview,
		placeholder = 'SELECT * FROM ...'
	}: {
		value: string;
		onRunPreview?: () => void;
		placeholder?: string;
	} = $props();

	let container: HTMLDivElement;
	let view: EditorView | undefined;
	let suppressUpdate = false;

	export function insertAtCursor(text: string) {
		if (!view) return;
		const cursor = view.state.selection.main.head;
		view.dispatch({ changes: { from: cursor, insert: text } });
		view.focus();
	}

	onMount(() => {
		const keys = [];
		if (onRunPreview) {
			keys.push({ key: 'Mod-Enter', run: () => { onRunPreview!(); return true; } });
		}

		view = new EditorView({
			state: EditorState.create({
				doc: value,
				extensions: [
					basicSetup,
					sql(),
					cmPlaceholder(placeholder),
					keymap.of(keys),
					EditorView.updateListener.of((update) => {
						if (update.docChanged && !suppressUpdate) {
							value = update.state.doc.toString();
						}
					}),
					EditorView.theme({
						'&': { fontSize: '13px' },
						'.cm-scroller': { overflow: 'auto' }
					})
				]
			}),
			parent: container
		});
	});

	$effect(() => {
		if (view && value !== view.state.doc.toString()) {
			suppressUpdate = true;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: value }
			});
			suppressUpdate = false;
		}
	});

	onDestroy(() => {
		view?.destroy();
	});
</script>

<div bind:this={container} class="min-h-[120px] overflow-hidden rounded border border-gray-300"></div>
