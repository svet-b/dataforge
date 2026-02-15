# Stage 5: Frontend Interactive Features

## Objective

Add the interactive design-time features: node configuration panels for each node type, CodeMirror SQL editor, data preview table, parameter management, and run history. This is where the application becomes usable as a real pipeline design tool.

## Prerequisites

Stages 1–4 are complete. The frontend has:
- SvelteKit app with pipeline list and editor pages
- DAG canvas with node/edge CRUD
- API client and pipeline store
- Tailwind styling

**Read the existing frontend code** — especially the component structure, store patterns, and styling conventions — before adding new features.

## Deliverables

### 1. Bottom Panel System

The bottom panel (below the DAG canvas) needs to become a tabbed, resizable panel. Implement:

- **Draggable resize handle** — user can drag the border between the canvas and bottom panel to resize
- **Tabs** — "Config", "Preview", "Run History" (and "LLM" in Stage 6)
- **Context-sensitive** — when a node is selected, show its config; when no node is selected, show pipeline-level options or run history
- The panel should start collapsed and expand when a node is selected

### 2. Node Configuration Panels

When a node is selected on the canvas, the bottom panel's "Config" tab shows a type-specific configuration form.

#### API Source Config (`components/nodes/ApiSourceConfig.svelte`)

A form with these fields:

- **URL Template** — text input. Show available parameters as chips/badges that can be clicked to insert `{{param_name}}`. E.g., if the pipeline has `start_date` parameter, show a `{{start_date}}` chip.
- **HTTP Method** — dropdown: GET, POST
- **Headers** — key-value editor (add/remove rows). Each value field supports `{{env.VAR_NAME}}` and `{{param_name}}` templates.
- **Request Body** (shown only for POST) — JSON textarea with template interpolation support
- **Response Path** — text input for dot notation (e.g., `data.readings`)
- **Pagination** — dropdown (none, offset, cursor) with conditional fields:
  - Offset: page_param (text), limit_param (text), limit (number)
  - Cursor: cursor_param (text), cursor_path (text)
- **Test Connection** button — calls the execution preview endpoint with current config, shows the raw response shape and extracted data count
- **Output Table Name** — text input (validated: SQL identifier, unique within pipeline)

All changes should auto-save (debounced 500ms) via `updateNode()` API call.

#### File Source Config (`components/nodes/FileSourceConfig.svelte`)

- **File upload** — drag-and-drop zone + click-to-browse. Uses `POST /api/pipelines/{id}/files` endpoint. Show currently uploaded file name if one exists.
- **File type** — auto-detected from extension, but overridable via dropdown (CSV, JSON, Parquet, Excel)
- **CSV Options** (shown when file_type is CSV):
  - Delimiter (text, default `,`)
  - Header row (number, default 1)
  - Encoding (dropdown: UTF-8, Latin-1, auto)
- **Excel Options** (shown when file_type is Excel):
  - Sheet name or index
- **Data Preview** — after upload, automatically show first 10 rows in a small table
- **Output Table Name** — text input

#### Transform Config (`components/nodes/TransformConfig.svelte`)

This is the most complex panel. Split into two columns:

```
┌─────────────────────────────┬────────────────────────────────────┐
│  Left Column                │  Right Column                      │
│                             │                                    │
│  Schema Reference:          │  SQL Editor (CodeMirror):          │
│  ┌──────────────────────┐   │  ┌──────────────────────────────┐  │
│  │ upstream tables with  │   │  │ SELECT                       │  │
│  │ column names + types  │   │  │   meter_id,                  │  │
│  │                       │   │  │   SUM(energy_kwh)            │  │
│  │ meter_readings:       │   │  │ FROM meter_readings          │  │
│  │   meter_id VARCHAR    │   │  │ GROUP BY meter_id            │  │
│  │   voltage   DOUBLE    │   │  │                              │  │
│  │   ...                 │   │  └──────────────────────────────┘  │
│  └──────────────────────┘   │                                    │
│                             │  [Apply] [Preview]                 │
│  Parameters:                │                                    │
│  ┌──────────────────────┐   │  Description:                      │
│  │ $start_date  date    │   │  ┌──────────────────────────────┐  │
│  │ $end_date    date    │   │  │ Human-readable description   │  │
│  │ $customer_id string  │   │  │ of what this transform does  │  │
│  └──────────────────────┘   │  └──────────────────────────────┘  │
│                             │                                    │
│  Output Table Name:         │                                    │
│  [hourly_readings     ]     │                                    │
└─────────────────────────────┴────────────────────────────────────┘
```

**Schema Reference panel:**
- Automatically populated by looking at upstream nodes' output_table_names
- For each upstream table, if we've previewed it before, show column names and types
- If not yet previewed, show just the table name with a "Preview to see schema" note
- Clicking a table or column name inserts it into the SQL editor at the cursor position

**Parameters panel:**
- Shows all pipeline parameters with their types
- Clicking a parameter inserts `$param_name` into the SQL editor

**SQL Editor:**
- Use CodeMirror 6 with SQL language support
- Install `@codemirror/lang-sql` and configure for a generic SQL dialect (DuckDB-specific mode if available via community packages)
- Syntax highlighting, line numbers, auto-closing brackets
- Wrap in a Svelte component (`components/sql-editor/SqlEditor.svelte`)

**Apply button:**
- Saves the SQL to the node config via `updateNode()` API
- Shows a brief "Saved" confirmation

**Preview button:**
- Calls `POST /api/pipelines/{id}/preview/{node_id}` with current parameters
- Shows results in the Data Preview Table (see below)

#### Output Config (`components/nodes/OutputConfig.svelte`)

Minimal config:
- **Source Table** — dropdown listing all node output_table_names in the pipeline (or auto-populated from the immediate upstream node)
- This determines which table's data becomes the pipeline result

### 3. Data Preview Table (`components/preview/DataPreview.svelte`)

A tabular display for previewing node output data:

- Renders below the node config panel (or as a tab)
- **Column headers** — show column name + type (in small text)
- **Sortable columns** — click header to sort
- **Row count** — displayed as "Showing 100 of 15,432 rows"
- **Scrollable** — both horizontal and vertical
- **Loading state** — spinner while executing preview
- **Error state** — if preview fails, show the error message prominently (red background) with the failed SQL and DuckDB error
- **Empty state** — "No data. Click Preview to execute."

Implementation options:
- **TanStack Table (Svelte adapter)** — feature-rich, handles virtual scrolling for large datasets
- **Simple HTML table** — acceptable for v1 if TanStack has compatibility issues

Style the table with alternating row colors, sticky headers, and a monospace font for numeric data.

### 4. Parameter Management (`components/ParameterManager.svelte`)

Accessible via the "Parameters" button in the toolbar. Opens as a modal or sidebar.

- **List of parameters** — name, type, default value, description
- **Add parameter** — form with: name (text), type (dropdown: string, date, integer, float), default value (text), description (text)
- **Edit parameter** — inline editing or edit form
- **Delete parameter** — with confirmation (warn if parameter is referenced in any node's SQL or URL template)
- **Parameter name validation** — must be a valid identifier, no spaces, no duplicates
- **Save** — calls `updatePipeline()` to save the parameters array

Also show a "Current Values" section where the user can override default values for design-time previews. These override values are stored in the pipeline store (client-side only, not persisted to backend).

### 5. Run History Panel (`components/RunHistory.svelte`)

Accessible as a tab in the bottom panel or via the "History" button in the toolbar.

- **List of recent runs** — newest first. Show: status (✓/✗ icon), timestamp, duration, row count, parameter summary
- **Click a run** → expands to show:
  - Full parameters used
  - Node timing breakdown
  - Output preview (first 100 rows) in the Data Preview Table
  - Error details (if failed)
- **Status colors** — green for success, red for failed, blue/spinner for running

Data comes from `GET /api/pipelines/{id}/runs`.

### 6. Run Pipeline Flow

When the user clicks "Run" in the toolbar:

1. Show a confirmation dialog with current parameter values (defaults + any overrides)
2. Allow the user to edit parameter values before running
3. On confirm, call `POST /api/pipelines/{id}/run` with the parameters
4. Show a loading spinner / progress indicator
5. On completion, automatically:
   - Switch to the "Run History" tab
   - Highlight the new run
   - If successful, show results in the Data Preview Table
   - If failed, show the error and highlight the failed node on the canvas (red border + error icon)

### 7. Toast Notifications

Implement a simple toast notification system for:
- "Pipeline saved"
- "Node deleted"
- "Edge rejected: would create a cycle"
- "Preview completed: 1,432 rows"
- "Pipeline execution failed: [error summary]"

Use a toast store and a `ToastContainer.svelte` component fixed to the bottom-right.

### 8. Node Status Indicators on Canvas

After a preview or run, update the node visuals on the canvas:
- **Success** — subtle green check icon on the node
- **Failed** — red border + error icon, clicking shows the error
- **Running** — subtle pulse/spin animation
- **Stale** — if the node's config changed since last preview, dim the status indicator

### 9. Keyboard Shortcuts

- `Delete` / `Backspace` — delete selected node or edge
- `Ctrl+S` / `Cmd+S` — save (prevent browser save dialog)
- `Ctrl+Enter` / `Cmd+Enter` — when in SQL editor, run preview

## Acceptance Criteria

- [ ] Selecting a node opens the correct configuration panel in the bottom panel
- [ ] API Source config: can edit URL template, headers, method, response path, pagination
- [ ] File Source config: can upload a CSV file, see a preview of the data
- [ ] Transform config: CodeMirror SQL editor works with syntax highlighting
- [ ] Transform config: schema reference shows upstream table columns (after preview)
- [ ] Transform config: clicking a column/parameter inserts it into the SQL editor
- [ ] Preview button executes the subgraph and shows results in the data table
- [ ] Preview errors show clearly with the failed SQL and error message
- [ ] Parameter management: can add, edit, delete parameters
- [ ] Run button executes the full pipeline with parameter values
- [ ] Run history shows recent runs with status, timing, and results
- [ ] Failed runs highlight the failed node on the canvas
- [ ] Toast notifications appear for key actions
- [ ] All existing functionality (DAG editing, node CRUD) still works

## What NOT to Build

- No LLM chat panel (Stage 6)
- No "Generate SQL" button (Stage 6)
- No Parquet caching visualization
- No authentication
