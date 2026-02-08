# Stage 4: Frontend Foundation

## Objective

Create the SvelteKit frontend with a visual DAG editor. At the end of this stage, a user can: view a list of pipelines, create a new pipeline, open the pipeline editor, add/remove/reposition nodes on a visual canvas, and connect nodes with edges. All changes persist to the backend via the API.

## Prerequisites

Stages 1–3 are complete. The backend is fully functional with:
- Pipeline/Node/Edge/File CRUD endpoints
- Pipeline execution endpoints
- SQLite database (sync SQLAlchemy)

**The backend must be running** during frontend development so you can test against it. Start it with `docker compose up backend`.

## Tech Stack

- **SvelteKit** — Application framework (use latest version, adapter-static for production)
- **Svelvet** — Svelte-native node graph library for the DAG canvas
- **Tailwind CSS** — Styling
- **TypeScript** — For type safety

**Important:** Before starting, check Svelvet's current API. Install it and read its docs. If Svelvet has breaking changes or isn't suitable, use `@xyflow/svelte` (Svelte Flow) as an alternative — it's the Svelte port of React Flow and is well-maintained.

## Deliverables

### 1. Project Setup

```
frontend/
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── src/
│   ├── app.css                    # Tailwind imports + global styles
│   ├── app.html
│   ├── routes/
│   │   ├── +layout.svelte         # App shell with navigation
│   │   ├── +page.svelte           # Pipeline list (home page)
│   │   └── pipelines/
│   │       └── [id]/
│   │           └── +page.svelte   # Pipeline editor
│   ├── lib/
│   │   ├── api/
│   │   │   └── client.ts          # Backend API client
│   │   ├── components/
│   │   │   ├── dag/
│   │   │   │   ├── DagCanvas.svelte       # Main DAG canvas wrapper
│   │   │   │   ├── SourceApiNode.svelte   # Custom node for API sources
│   │   │   │   ├── SourceFileNode.svelte  # Custom node for file sources
│   │   │   │   ├── TransformNode.svelte   # Custom node for transforms
│   │   │   │   └── OutputNode.svelte      # Custom node for output
│   │   │   ├── PipelineList.svelte
│   │   │   ├── Toolbar.svelte
│   │   │   └── NodePalette.svelte         # Sidebar for adding nodes
│   │   ├── stores/
│   │   │   └── pipeline.ts        # Svelte store for current pipeline state
│   │   └── types/
│   │       └── index.ts           # TypeScript interfaces matching backend schemas
│   └── static/
└── tests/                         # Playwright or Vitest component tests (optional)
```

### 2. API Client (`src/lib/api/client.ts`)

Create a typed API client that wraps `fetch`:

```typescript
const API_BASE = 'http://localhost:8000/api';

// Types matching backend Pydantic schemas
export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  parameters: PipelineParameter[];
  created_at: string;
  updated_at: string;
}

export interface PipelineDetail extends Pipeline {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface PipelineNode {
  id: string;
  pipeline_id: string;
  type: 'source_api' | 'source_file' | 'transform' | 'output';
  name: string;
  position_x: number;
  position_y: number;
  config: Record<string, any>;
  output_table_name: string;
}

export interface PipelineEdge {
  id: string;
  pipeline_id: string;
  source_node_id: string;
  target_node_id: string;
}

export interface PipelineParameter {
  name: string;
  type: string;
  default?: string;
  description?: string;
}

export interface RunResult {
  run_id: string;
  status: 'success' | 'failed';
  duration_ms: number;
  row_count: number | null;
  data: Record<string, any>[] | null;
  error: { node_id: string; node_name: string; message: string; sql?: string } | null;
  node_timings: Record<string, any>;
}

// API functions
export async function listPipelines(): Promise<Pipeline[]> { ... }
export async function createPipeline(data: { name: string; description?: string }): Promise<Pipeline> { ... }
export async function getPipeline(id: string): Promise<PipelineDetail> { ... }
export async function updatePipeline(id: string, data: Partial<Pipeline>): Promise<Pipeline> { ... }
export async function deletePipeline(id: string): Promise<void> { ... }

export async function addNode(pipelineId: string, data: Omit<PipelineNode, 'id' | 'pipeline_id'>): Promise<PipelineNode> { ... }
export async function updateNode(pipelineId: string, nodeId: string, data: Partial<PipelineNode>): Promise<PipelineNode> { ... }
export async function deleteNode(pipelineId: string, nodeId: string): Promise<void> { ... }

export async function addEdge(pipelineId: string, data: { source_node_id: string; target_node_id: string }): Promise<PipelineEdge> { ... }
export async function deleteEdge(pipelineId: string, edgeId: string): Promise<void> { ... }

export async function runPipeline(pipelineId: string, parameters?: Record<string, any>): Promise<RunResult> { ... }
export async function previewNode(pipelineId: string, nodeId: string, parameters?: Record<string, any>): Promise<RunResult> { ... }
```

Handle errors gracefully — parse error details from the response body and throw typed errors.

### 3. Pipeline List Page (`routes/+page.svelte`)

The home page shows all pipelines as a list/grid:

- Display pipeline name, description, node count, last updated
- "New Pipeline" button → opens a modal/dialog to enter name and description → creates via API → navigates to editor
- Click a pipeline → navigates to `/pipelines/{id}`
- Delete button (with confirmation) on each pipeline
- Empty state when no pipelines exist

**Design guidelines:**
- Clean, professional look. Think linear.app or Notion-style.
- Use Tailwind for styling. Dark sidebar or top bar with the app name "DataForge".
- Responsive but desktop-first (this is a professional tool).

### 4. Pipeline Editor Page (`routes/pipelines/[id]/+page.svelte`)

This is the main workspace. Layout:

```
┌──────────────────────────────────────────────────────────┐
│  Toolbar: [← Back] [Pipeline Name (editable)] [Save] [Run] │
├────────┬─────────────────────────────────────────────────┤
│ Node   │                                                 │
│ Palette│           DAG Canvas (Svelvet)                  │
│        │                                                 │
│ [API]  │                                                 │
│ [File] │     Nodes are draggable, connectable            │
│ [SQL]  │                                                 │
│ [Out]  │                                                 │
│        │                                                 │
├────────┴─────────────────────────────────────────────────┤
│  Bottom Panel (collapsed by default, expands on node     │
│  selection — this will be used in Stage 5 for config     │
│  panels, SQL editor, and data preview)                   │
└──────────────────────────────────────────────────────────┘
```

### 5. DAG Canvas (`DagCanvas.svelte`)

Using Svelvet (or Svelte Flow), implement:

**Custom node components** for each type:
- **SourceApiNode:** Blue background, cloud icon, shows node name. Has one output port (right side).
- **SourceFileNode:** Green background, file icon, shows node name. Has one output port.
- **TransformNode:** Orange background, code/gear icon, shows node name. Has input port(s) (left) and output port (right).
- **OutputNode:** Purple background, flag icon, shows node name. Has one input port (left), no output port.

Each node should display:
- The node name (editable inline or via double-click)
- A small type indicator/icon
- The `output_table_name` in small text below the name
- A subtle status indicator (will be used for execution status in Stage 5)

**Node interactions:**
- **Add:** Drag from the Node Palette onto the canvas, or right-click canvas → context menu. When added, call `addNode()` API with the position.
- **Move:** Drag nodes to reposition. On drag end, call `updateNode()` API with new position.
- **Delete:** Right-click node → "Delete" option, or select + Delete key. Call `deleteNode()` API.
- **Select:** Click to select. Selection state stored in the pipeline store.

**Edge interactions:**
- **Connect:** Drag from an output port to an input port. On connection, call `addEdge()` API. If the API returns an error (e.g., cycle), show a toast notification and don't create the edge.
- **Delete:** Right-click edge → "Delete", or select + Delete key. Call `deleteEdge()` API.

**Canvas features:**
- Pan and zoom (built-in with Svelvet/Svelte Flow)
- Minimap (optional, nice to have)
- Snap-to-grid (optional)

### 6. Node Palette (`NodePalette.svelte`)

A sidebar panel listing the 4 node types. Each type is a draggable item. When dropped onto the canvas, it creates a new node of that type.

Alternatively, implement as buttons that add a node at the center of the current viewport.

### 7. Toolbar (`Toolbar.svelte`)

- Back button → navigates to pipeline list
- Pipeline name → editable inline (click to edit, Enter to save, calls `updatePipeline()`)
- Save button → saves current state (though individual changes auto-save via API, this provides a mental model for users)
- Run button → calls `runPipeline()` → shows result in a toast or the bottom panel (basic version for now, full implementation in Stage 5)

### 8. Pipeline Store (`stores/pipeline.ts`)

A Svelte writable store that holds the current pipeline state:

```typescript
import { writable } from 'svelte/store';

interface PipelineState {
  pipeline: PipelineDetail | null;
  selectedNodeId: string | null;
  loading: boolean;
  error: string | null;
}

export const pipelineStore = writable<PipelineState>({
  pipeline: null,
  selectedNodeId: null,
  loading: false,
  error: null,
});

// Actions
export async function loadPipeline(id: string) { ... }
export async function addNodeAction(type: string, position: { x: number, y: number }) { ... }
export async function deleteNodeAction(nodeId: string) { ... }
export async function updateNodeAction(nodeId: string, updates: Partial<PipelineNode>) { ... }
export async function addEdgeAction(sourceId: string, targetId: string) { ... }
export async function deleteEdgeAction(edgeId: string) { ... }
```

The store actions call the API client and update the local state optimistically (update local state immediately, revert on API error).

### 9. Styling

Use Tailwind with a clean, professional color scheme:

```
Background: slate-50 (light mode)
Sidebar: slate-800 or slate-900
Primary accent: blue-600
Node colors:
  - API source: blue-100 border-blue-400
  - File source: green-100 border-green-400
  - Transform: orange-100 border-orange-400
  - Output: purple-100 border-purple-400
Text: slate-800 (primary), slate-500 (secondary)
```

### 10. Proxy Configuration

Configure Vite to proxy API calls to the backend:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

Update the API client to use relative URLs (`/api/...` instead of `http://localhost:8000/api/...`) so the proxy works.

## Acceptance Criteria

- [ ] `npm run dev` starts the SvelteKit dev server
- [ ] Pipeline list page shows existing pipelines from the backend
- [ ] Can create a new pipeline from the list page
- [ ] Can navigate to the pipeline editor
- [ ] Pipeline editor shows the DAG canvas with existing nodes and edges
- [ ] Can add new nodes by dragging from the palette (or clicking)
- [ ] Nodes display correctly with type-specific colors and icons
- [ ] Can connect nodes by dragging between ports
- [ ] Cycle detection works — connecting in a cycle shows an error and doesn't create the edge
- [ ] Can delete nodes and edges
- [ ] Can drag nodes to reposition them (position persists to backend)
- [ ] Pipeline name is editable from the toolbar
- [ ] Can delete a pipeline from the list page
- [ ] No console errors during normal usage

## What NOT to Build

- No node configuration panels (Stage 5) — selecting a node doesn't open a config form yet
- No SQL editor (Stage 5)
- No data preview (Stage 5)
- No LLM chat (Stage 6)
- No parameter management UI (Stage 5)
- No run history display (Stage 5)

The bottom panel should exist in the layout but can show a placeholder like "Select a node to configure it" for now.
