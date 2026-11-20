# Lumen

A calm, keyboard-first, local-first planner. Built with Vite, React, TypeScript and Tailwind CSS v4. Everything is stored in your browser's `localStorage`. There is no backend and no account.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

On first run Lumen seeds about 30 demo tasks across 4 projects, plus 6 months of backdated history, so the dashboard has data to show. Remove it from **Settings → Clear demo data**. Your own tasks are kept.

## Features

**Core**
- Tasks with title, notes, due date and time, priority (P1–P4), tags, project, energy level (high/low), estimate and subtasks
- Recurring tasks: daily, weekdays, weekly, monthly, every N days. Completing one schedules the next occurrence.
- Views: Dashboard, Inbox, Today, Upcoming (14 days plus Later), Logbook and one view per project (double-click the title to rename)
- Search and filters for text, priority, tags and "match my energy"
- Undo toast for complete, delete, import and clear actions, plus `⌘Z`
- JSON export and import (versioned schema, migrated on load)
- Dark theme (default) and light theme

**Differentiators**
1. **Natural-language quick add** with inline token highlighting and live parsed chips:
   `Call mom tomorrow 5pm #family !high ~low-energy @personal ~30m every mon`
2. **⌘K command palette** for navigating, creating tasks (type any NL task), toggling the theme, starting focus on a task, export/import and settings
3. **Dashboard** with a progress ring, focus minutes and a sparkline, the current and best streak, overdue count, Today's Focus ("frogs" first), the next 7 days, a weekly completed-vs-planned chart, a project/tag breakdown and a custom SVG year heatmap
4. **Eisenhower matrix**. Dragging a task between quadrants adjusts its priority and due date.
5. **Kanban board** (To do / In progress / Done) with drag-and-drop
6. **Focus mode**: a full-screen Pomodoro timer with a ring and an ambient gradient. It logs focus minutes per task and per day.
7. **Morning "Plan my day"**: pick your energy level and a daily cap. Suggestions are ranked overdue first, then high priority, then due soon. **Evening shutdown** shows a summary, lets you roll tasks over to tomorrow, and has a reflection note.
8. **Streaks**: current and best, with a 7-day strip
9. **Delight**: a spring checkbox with a drawn check and a burst, a strike-through then collapse on completion, and confetti when today's list is cleared (can be turned off in Settings)

All motion respects `prefers-reduced-motion`.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl K` | Command menu |
| `Q` or `N` | Quick add |
| `/` | Focus the filter box |
| `G` then `D` `I` `T` `U` `L` `M` `B` | Go to Dashboard, Inbox, Today, Upcoming, Logbook, Matrix, Board |
| `J` / `K` (or arrow keys) | Move the selection |
| `X` or `Space` | Complete the selected task |
| `E` or `Enter` | Edit the selected task |
| `1` to `4` | Set priority |
| `T` | Toggle "planned for today" |
| `⌫` | Delete (with undo) |
| `F` | Focus mode on the selected task |
| `P` | Plan my day |
| `⇧S` | Evening shutdown |
| `⇧T` | Toggle theme |
| `⌘Z` | Undo |
| `?` | Shortcut sheet |

In focus mode: `Space` starts or pauses, `R` resets, `S` skips, `Esc` exits (time worked so far is logged).

## Quick-add syntax

| Token | Meaning |
|---|---|
| `tomorrow 5pm`, `next fri`, `in 3 days` | Due date and time (chrono-node) |
| `#tag` | Tag |
| `!high` `!med` `!low` `!p1`–`!p4` | Priority |
| `@project` | Project. An unknown name creates a new project. |
| `~high` / `~low-energy` | Energy level |
| `~30m` / `~1.5h` | Estimate |
| `every day`, `every weekday`, `every mon`, `every 3 days`, `monthly` | Recurrence |

## Structure

```
src/
  components/   UI building blocks (cards, task row, palette, heatmap, ring, charts, dialogs)
  views/        Dashboard, ListView, BoardView, MatrixView, FocusMode, PlanDay, Shutdown
  store/        zustand stores: persisted data (schema v1) and ephemeral UI state
  lib/          types, NL parser, recurrence, stats, suggestions, seed data, motion tokens
  hooks/        keyboard shortcuts and derived selectors
```
