Items are listed in priority order and should be addressed starting from 1.

---

1. ~~Inputs~~ **DONE**

~~Two issues:~~

~~- **Table naming:** Inputs (and the corresponding DuckDB table names) should be derived from the file name or API endpoint path, rather than generic names like `file_1` or `api_1`.~~
~~- **Show schema in Inputs panel:** Display the schema (column names and types) directly in the respective input's card/section within the Inputs panel.~~

---

2. ~~Results table~~ **DONE**

~~Upgrade the results table using **TanStack Table** (Svelte adapter). Requirements:~~

~~- The table header and table name/tabs above it should scroll independently — the table body should scroll horizontally on its own.~~
~~- Columns should be resizable, with initial width auto-sized to fit content.~~
~~- Numbers should be right-aligned and have the same precision, based on number of significant figures (e.g. 10)~~
~~- Include column sorting (click header to toggle asc/desc).~~

---

3. Results visualization

Split the right-side results panel into two vertical sections: data table on top, visualization on the bottom. The bottom section shows a chart of the currently selected result table.

Use **Chart.js** (via `svelte-chartjs` or equivalent Svelte wrapper).

- **Axis selection:** Auto-detect axes by default — use the first string or date column as the x-axis, and all numeric columns as y-axis series. Show dropdown controls above the chart so the user can override the x-axis column and toggle which numeric columns are included as series.
- **Initial chart type:** Bar chart. The implementation should be structured so that additional chart types (line, scatter, etc.) can be added later without major refactoring.
- **Edge cases:** If the result set has no numeric columns, or is empty, show a message instead of a chart (e.g., "No numeric data to visualize").

---

4. AI Agent

- **Pass current query to the agent:** The LLM agent must be able to see the current SQL query so that it can modify it when asked (e.g., "add a WHERE clause"). Currently it does not appear to receive the current query.
- **Put generated SQL in the editor, not the chat:** When the agent produces SQL, it should be placed directly into the SQL query editor area (replacing the current contents), rather than being displayed as a message in the chat. The chat should confirm what was done in plain text (e.g., "I've updated the query to filter by date"). As now, the agent should generate the FULL query, rather than a diff.

---

5. Save indicator

Add a **Save button** in the top toolbar, positioned between "Parameters" and "Run". The button should:

- Trigger a manual save of the current pipeline state (sources, query, parameters).
- Visually indicate when there are unsaved changes (e.g., change the button label/style to show a dot or "unsaved" state).
- After a successful save, return to the default/clean state.

6. Revision history and checkpoints

It would be nice to be able to go back through revisions of not just the pipeline runs, but also the SQL query used - especially as the AI agent makes changes, and may lead to a need to restore a previous version. **skip this item until detailed requirements are established.**

6. Naming

"Pipeline" is no longer the right name for the core concept and should be renamed. The replacement name is TBD — **skip this item until a decision is made.**
