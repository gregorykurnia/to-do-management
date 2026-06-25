# to-do-management

Single-file personal todo web app. All code lives in `index.html` — inline CSS, inline JS, no build step.

## Deployment

Hosted on GitHub Pages from `main` branch. Edits to `index.html` must be committed and pushed to take effect:

```
git add index.html && git commit -m "..." && git push origin main
```

After pushing, wait ~60 seconds then hard-refresh the live domain (Cmd+Shift+R).

## Backend

Firebase Firestore (compat SDK v10.12.2). Collections: `tasks`, `events`, `milestones`, `settings` (single `config` doc).

## Key architecture decisions

- **No UTC date math** — always use `getFullYear()/getMonth()/getDate()` (local time). The `ds(d)` helper and `getToday()` function handle this. Never use `toISOString()` for date strings — it outputs UTC and causes off-by-one bugs in UTC+ timezones.
- **Dynamic today** — use `getToday()` (a function) everywhere, never the `const TODAY` at the top (which is stale after midnight). `TODAY` is kept only for seed data offsets.
- **My Tasks vs Team Tasks** — separated by `assignee === 'me'` vs `assignee !== 'me'`. New tasks always default to `assignee: 'me'`. Use `claimTask(id)` to move a task from Team → My Tasks.
- **Cell dropdowns escape overflow clipping** — `toggleCellDd()` uses `position:fixed` + `getBoundingClientRect()` so dropdowns render above the scrollable table container.
- **Firestore empty-array detection** — use `Array.isArray(d.customCols)` not `d.customCols?.length` (empty array is falsy but valid).

## Task ownership
- `assignee: 'me'` → My Tasks
- `assignee: 'dev1' | 'dev2' | 'sales' | 'ops'` → Team Tasks

## Settings persistence
`prioTypes`, `taskTypes`, `tags`, `customCols`, `colDefs` all saved via `fbSaveSettings()` to `settings/config` doc. Loaded on init via `fbLoadSettings()`.
## Git
After completing any task, always:
git add .
git commit -m "[brief description of what was done]"
git push origin main