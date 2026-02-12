import type { Component, ComponentProps, Snippet } from 'svelte';

export class RenderComponentConfig<TComponent extends Component<any>> {
	constructor(
		public component: TComponent,
		public props: ComponentProps<TComponent>
	) {}
}

export class RenderSnippetConfig<TProps> {
	constructor(
		public snippet: Snippet<[TProps]>,
		public params: TProps
	) {}
}

export function renderComponent<TComponent extends Component<any>>(
	component: TComponent,
	props: ComponentProps<TComponent>
) {
	return new RenderComponentConfig(component, props);
}

export function renderSnippet<TProps>(snippet: Snippet<[TProps]>, params: TProps) {
	return new RenderSnippetConfig(snippet, params);
}
