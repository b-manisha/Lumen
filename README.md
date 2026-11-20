# Lumen

A calm, keyboard-first, local-first planner. Built with Vite, React, TypeScript and Tailwind CSS v4. Everything is stored in your browser's `localStorage`. There is no backend and no account. In development, a small Vite plugin mirrors your delegated tasks to `piles/` so Claude Code agents can work on them (see [Delegation & agents](#delegation--agents)).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
npm run lint     # oxlint
npm run test:sort  # sanity checks for the delegation auto-sort
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
| `G` then `D` `I` `T` `U` `L` `M` `B` `A` | Go to Dashboard, Inbox, Today, Upcoming, Logbook, Matrix, Board, Delegation |
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
| `^me` / `^mgr` / `^jr` | Delegation pile override: you, Manager agent, Junior agent (also `^manager`, `^junior`, `^you`). Without it the task is auto-sorted. `@` stays reserved for projects. |

## Delegation & agents

You are the **Chief Human Officer (CHO)**. Every task belongs to one of three piles:

| Pile | What goes there |
|---|---|
| **You · Chief Human Officer** | Things only a human can or should do |
| **Manager agent** | Planning, research, analysis, comparisons, roadmaps, reviews, prioritising, breaking work down, proposals |
| **Junior agent** | Drafting, writing, summarising, outlines, formatting, lists, lookups, proofreading, templates, notes, checklists |

**Auto-sort** (`src/lib/delegate.ts`) is a deterministic, rule-based classifier with weighted keyword and tag rules. It returns an owner, a short reason ("Phone call → needs you") and a confidence. Hard human rules always win and **lock** the task to you, so agents can never be assigned it, not even by drag-and-drop: calls and meetings, in-person errands, payments and purchases, booking, signing and IDs, sending messages as you, personal/health/family matters, decisions and approvals, and anything that needs a login. When nothing matches, the task stays with you at low confidence. Run `npm run test:sort` for ~40 example titles.

Auto-sorted tasks re-sort when their title, tags or project change. A manual choice (drag between piles, the drawer's **Owner** control, or `^me` / `^mgr` / `^jr` in quick add) is never overridden; **Reset to auto** in the drawer hands it back. **Re-sort all** re-runs auto-sort on every auto-sorted task.

**Delegation view** (`G A`, sidebar → Views, or ⌘K → Delegation): three piles with counts, drag-and-drop between them (a drop makes the choice manual and re-queues the agent), the sort reason and agent status on every card (Queued, Working, Ready for review, Returned to you, Approved), a status filter, and an "Agents connected / Offline" indicator. Task rows everywhere carry a small owner glyph, and the dashboard has a Delegation tile with counts per pile and outputs awaiting review.

**Reviewing agent work**: open a task that is *Ready for review* to see the rendered markdown output, then **Approve** (marks it approved; it does not complete the task), **Send back** with a note (re-queued with your feedback and the previous draft), or **Take it over** (moves it to your pile, keeping the draft).

### The bridge to Claude Code

The browser can't write files, so `plugins/piles.ts` adds a dev-only API to the Vite server:

| Endpoint | Does |
|---|---|
| `GET /api/piles` | Health check (drives the connected indicator) |
| `POST /api/piles` | Writes `piles/queue.json` and `piles/{human,manager,junior}.md` from the open tasks |
| `GET /api/piles/results` | Returns `piles/results/*.json` |
| `POST /api/piles/results/ack` | Moves processed result files to `piles/results/processed/` |

The app syncs the queue about a second after any change and polls for results every 5 s while the tab is visible. A `returned` result moves the task to your pile with the agent's note as the reason; manager-proposed subtasks are added; new outputs pop a toast. In a production build there is no bridge: the view shows **Offline** with **Export** buttons for the same four files. `piles/` is git-ignored (it is personal task data) except `piles/README.md`, which documents the file formats.

### Running the agents

With the dev server running, ask Claude Code in this folder to **"run the piles"** (or "run my agents"). The project skill `.claude/skills/run-piles/SKILL.md` reads the queue, spawns a Manager subagent (Opus) and Junior subagents (Sonnet/Haiku), writes one `piles/results/<taskId>.json` per task, and summarises. Agents never send messages, buy, book, sign in, enter credentials, delete anything or act as you. Those tasks come back to your pile with a note on what is prepared and what you need to do.

## Structure

```
src/
  components/   UI building blocks (cards, task row, palette, heatmap, ring, charts, dialogs)
  views/        Dashboard, ListView, BoardView, MatrixView, FocusMode, PlanDay, Shutdown
  store/        zustand stores: persisted data (schema v2, migrates v1) and ephemeral UI state
  lib/          types, NL parser, recurrence, stats, suggestions, seed data, motion tokens,
                delegate.ts (auto-sort), piles.ts (queue + checklists), bridge.ts (sync + polling)
  hooks/        keyboard shortcuts and derived selectors
plugins/piles.ts  dev-only Vite plugin: the /api/piles bridge
scripts/          test-sort.ts (npm run test:sort)
piles/            agent hand-off folder (git-ignored except README.md)
.claude/skills/run-piles/  Claude Code runbook for the agent piles
```
