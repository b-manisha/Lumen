# Research: Premium Client-Only To-Do App (Nov 2026)

Constraints: Vite + React + TS, localStorage only, no backend, no paid APIs.

## 1. Competitive landscape

| App | Positioning | Signature strengths | Price (approx.) |
|---|---|---|---|
| Todoist | Best all-rounder | NL quick add, filters, karma/streaks, projects | ~$5/mo Pro |
| TickTick | Value pick | Built-in pomodoro, habits, calendar, Eisenhower view | ~$36-50/yr |
| Things 3 | Design benchmark | Calm UI, Today/Evening/Someday, one-time price | ~$80 one-time, Apple only |
| Linear | Issue tracker (aesthetic reference) | ⌘K everything, keyboard-first, speed, dark polish | Free / $8+ |
| Sunsama | Mindful daily planning | Guided morning plan + shutdown ritual, timeboxing | ~$16-25/mo |
| Akiflow | Power-user time-blocking | Universal inbox, command bar, drag to calendar | ~$20-34/mo |
| Motion | AI auto-scheduler | Auto-places tasks on calendar by deadline/priority | ~$19-34/mo |
| Amie | Calendar + todo, playful | Joyful animations, lighter Sunsama alternative | Free tier |
| Structured | Visual day timeline | Tasks as time slots on a timeline, ADHD-friendly | Free / ~$20/yr |
| Notion tasks | Flexible DB | Multiple views (board/table/calendar) on one dataset | Free / $10+ |

Takeaway: nobody pairs the design and speed of Things/Linear with Sunsama's planning ritual and TickTick's built-in focus tools in one free, offline, private app. That's the gap to target.

## 2. User pain points

1. **Paywalled basics**: Todoist made NL input/reminders Premium-only; TickTick paywalls calendar and themes. Users resent losing features after a price increase.
2. **Subscription fatigue**: $16-34/mo for planners (Sunsama, Akiflow, Motion) feels steep for individuals.
3. **Sync lag and reliability**: reports of TickTick taking 30-90s to sync between devices (unverified). An instant local-first app avoids this entirely.
4. **Feature bloat**: "too many features to keep track of". Power features should stay hidden until summoned (⌘K).
5. **NL parsing errors**: the parser "sometimes gets confused". Users want a live preview of the parsed tokens before saving.
6. **Overwhelm / guilt lists**: endless overdue lists with no sense of a finished day. Rituals and daily caps (Sunsama) help.
7. **Platform lock-in**: Things is Apple-only. Users want web access and data export.
8. **No reflection loop**: few apps show meaningful progress beyond a counter.

## 3. Recommended feature set

### MUST-HAVE (core)
- Task CRUD with title, notes, due date/time, priority (P1-P4), tags, project/list. (S)
- Views for Inbox, Today, Upcoming, Completed/Logbook, and per project. (M)
- Subtasks/checklists with a progress fraction. (S)
- Recurring tasks (daily, weekdays, weekly on X, monthly, every N days). (M)
- Search and filters (tag, priority, date, project). (S)
- Keyboard shortcuts throughout, plus undo toast. (S)
- Persistence in localStorage with a schema version, plus JSON export/import as a backup. (S)
- Dark/light theme toggle. (S)

### DIFFERENTIATORS
| # | Feature | Rationale | Size |
|---|---|---|---|
| 1 | **NL quick add** (`call mom tomorrow 5pm #family !high ~30m every mon`) with live token chips | Todoist's best feature, free, and the preview fixes the "parser got confused" complaint. chrono-node handles dates | M |
| 2 | **⌘K command palette** for actions, navigation, task search, theme | Linear/Raycast signature. Keeps power features out of the way | M |
| 3 | **Focus mode + Pomodoro** (full-screen single task, ring timer, ambient gradient) | TickTick's most-loved extra. Logs focus minutes for analytics | M |
| 4 | **Daily planning ritual** (morning: pick from backlog, set daily cap, estimate; evening: review, roll over, reflect) | Sunsama's $20/mo core loop, free here | M |
| 5 | **Time-blocking timeline** (drag tasks onto a day timeline) | Structured/Akiflow-style visual day | L |
| 6 | **Productivity heatmap + streaks** (GitHub-style, 365 days) | Reflection loop, and a striking visual | S |
| 7 | **Eisenhower matrix view** (urgent/important quadrants, drag between) | Derived from priority + due date, cheap extra view | S |
| 8 | **Kanban board** (Todo / Doing / Done or by project) | Notion/Linear expectation for project work | M |
| 9 | **Energy-level tagging** (⚡ high / ☁ low) + "match my energy" filter | Novel and ADHD-friendly. Few competitors have it | S |
| 10 | **Smart "Plan my day" suggestions** (local heuristic: overdue, priority, due, energy, estimate fit into free time) | Motion-like value with no AI API | M |
| 11 | **Weekly review dashboard** (completed vs planned, estimate accuracy, top tags) | Turns the data into insight | S |
| 12 | **Completion delight**: spring check animation, confetti on clearing Today, subtle sound (opt-in) | Amie/Things-level joy | S |

Build order: 1, 2, 6, 7, 3, 4, 8, 9, 11, 12, 10, 5.

## 4. Premium dashboard design spec

**Principles** (Linear/Vercel/Raycast/Arc): dark-first and near-black (never #000). Mostly achromatic, with one accent. Show depth through layered white-alpha surfaces and 1px hairline borders rather than heavy shadows. Use dense, crisp type, keyboard-first controls, and fast motion. Glow is the exception, reserved for the focus ring, primary CTA and active states.

### Typography (Google Fonts)
- UI: **Inter** (variable, 400/500/600). Enable `font-feature-settings: "cv01","ss03","cv11"` and `font-variant-numeric: tabular-nums` on numbers. Alternative: **Geist** (`geist` npm package).
- Display and big numbers: **Inter Tight** 600, letter-spacing -0.02em to -0.03em.
- Mono (shortcuts, timers, token chips): **JetBrains Mono** or Geist Mono, 12-13px.
- Scale (px): 11 / 12 / 13 (base UI) / 14 / 16 / 20 / 24 / 32 / 48 (hero stat). Line-height 1.4 body, 1.1 display.

### Color tokens
| Token | Dark (primary) | Light |
|---|---|---|
| `--bg` | #08090A | #FAFAFA |
| `--bg-elevated` | #0F1012 | #FFFFFF |
| `--surface` | #141518 | #F4F4F5 |
| `--surface-hover` | #1B1C20 | #EDEDEF |
| `--border` | rgba(255,255,255,0.08) | rgba(0,0,0,0.08) |
| `--border-strong` | rgba(255,255,255,0.14) | rgba(0,0,0,0.14) |
| `--text` | #EDEDEF | #111113 |
| `--text-muted` | #8A8F98 | #5E6370 |
| `--text-faint` | #5A5F69 | #9A9EA8 |
| `--accent` (indigo-violet) | #7C7FFF | #5E5CE6 |
| `--accent-hover` | #9496FF | #4B48D9 |
| `--accent-soft` | rgba(124,127,255,0.14) | rgba(94,92,230,0.10) |
| `--success` | #3DD68C | #18A058 |
| `--warning` | #F5B748 | #D98E04 |
| `--danger` | #FF6369 | #E5484D |
| `--info` | #52A9FF | #0B78E3 |
| Priority P1/P2/P3/P4 | #FF6369 / #F5B748 / #52A9FF / #5A5F69 | same hues, slightly darker |
| Heatmap ramp | #141518, #23245A, #3B3DA8, #5E61E6, #9496FF | #EDEDEF, #CFCFFA, #A3A2F2, #6F6DE9, #4B48D9 |

### Spacing and radius
- Spacing (4px base): 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radius: 4 (chips), 6 (inputs/buttons), 8 (rows), 12 (cards), 16 (modals/palette), 999 (pills).
- Content max width 1280. Sidebar 240 (collapsible to 56). Card padding 20. Grid gap 16.

### Depth, shadow and glow recipes
- **Card**: `background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%), var(--surface); border:1px solid var(--border); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.4);` The inset line gives a "top light" edge.
- **Elevated (popover/palette)**: `box-shadow: 0 0 0 1px var(--border-strong), 0 16px 48px -8px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.3);`
- **Glass (palette, focus overlay, sticky header)**: `background: rgba(20,21,24,0.72); backdrop-filter: blur(20px) saturate(160%);` with hairline border. Use it on overlays only, never on dense lists.
- **Accent glow** (primary button, progress ring, focus timer): `box-shadow: 0 0 0 1px rgba(124,127,255,0.5), 0 0 24px -4px rgba(124,127,255,0.55);`
- **Ambient backdrop**: one or two large blurred radial gradients (accent at 8-12% opacity) behind the dashboard hero, plus an optional 2-3% noise texture overlay for an Arc/Raycast feel.
- **Spotlight hover**: a radial gradient that follows the cursor on cards (`--x/--y` CSS vars), with the border brightening near the cursor. This is Linear's signature card effect.
- Focus rings: `outline: 2px solid var(--accent); outline-offset: 2px` (accessibility).

### Motion
- Durations: 120ms (hover/press), 180ms (toggle, checkbox), 240ms (popover, palette), 320-400ms (page/view transitions, list reorder), 600-900ms (number count-up, ring fill).
- Easings: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out, the default for entrances), `cubic-bezier(0.4, 0, 0.2, 1)` (standard), and exits at roughly 70% of entrance duration.
- Springs (framer-motion): `{type:"spring", stiffness: 400, damping: 30}` for layout, and `{stiffness: 600, damping: 20}` for the checkbox pop.
- Patterns: the palette scales from 0.98 to 1 with fade. Lists use `layout` animation with 20ms staggered entrance. A completed task strikes through, fades, then collapses its height. Stat numbers count up. Press state is `scale(0.97)`. Respect `prefers-reduced-motion`.

### Dashboard layout (12-column grid)
1. **Header**: greeting with date ("Good evening, Wednesday 19 Nov"), quick-add bar (⌘K / `Q` hint chip), theme toggle.
2. **Row 1 (KPI)**: *Today's progress ring* (done/planned, accent glow), *Focus time today* (minutes, sparkline), *Current streak* (flame and number, best streak), *Overdue count* (danger tint only when greater than 0).
3. **Row 2**: *Today's Focus* list (span 7: top 3 "frogs" plus the rest, inline check) and *Day timeline* (span 5: time blocks with a now-line).
4. **Row 3**: *Weekly completion chart* (span 7: bars of completed vs planned, rounded tops, accent gradient) and *Upcoming 7 days* (span 5: grouped by day).
5. **Row 4**: *Productivity heatmap* (span 12: 52 by 7 cells, tooltip) and *Tag/project breakdown* (donut or horizontal bars).
6. Empty states: illustrated with a single line of encouraging copy and a CTA.
Collapse to a single column under 768px.

## 5. Recommended libraries

| Package | Reason |
|---|---|
| `react`, `react-dom`, `vite`, `typescript` | Baseline stack |
| `tailwindcss` (v4) + `@tailwindcss/vite` | Token-driven styling via CSS variables, fast iteration |
| `clsx` + `tailwind-merge` | Clean conditional class composition |
| `zustand` (+ `persist` middleware) | Tiny global store, persists to localStorage directly |
| `framer-motion` (package `motion`) | Layout animations, springs, AnimatePresence for list/check effects |
| `lucide-react` | Consistent, crisp 1.5px-stroke icon set |
| `cmdk` | Unstyled, accessible ⌘K palette (as used by Vercel/Linear-style UIs) |
| `chrono-node` | Robust NL date parsing ("next fri 3pm", "in 2 days") |
| `date-fns` | Tree-shakeable date math and formatting, recurrence calculation |
| `@dnd-kit/core` + `@dnd-kit/sortable` | Accessible drag-and-drop for kanban, matrix and timeline |
| `recharts` | Quick, themeable bar/area/radial charts for weekly stats |
| `react-activity-calendar` (or a custom SVG) | GitHub-style heatmap. A custom SVG is about 60 lines and fully themeable |
| `sonner` | Elegant toasts with undo actions |
| `@radix-ui/react-popover`, `react-dropdown-menu`, `react-dialog`, `react-tooltip` | Accessible headless primitives |
| `nanoid` | Small IDs for tasks |
| `canvas-confetti` | Celebration when the day is cleared |
| `@fontsource-variable/inter`, `@fontsource/jetbrains-mono` | Self-hosted fonts that work offline, no FOUT from the Google CDN |
| `vite-plugin-pwa` (optional) | Installable and offline, which supports the "local-first, private" pitch |

### Sources
- [Rework: Best task management software 2026](https://resources.rework.com/tools/productivity/best-task-management-software-2026)
- [Dupple: 8 best task management apps 2026](https://dupple.com/learn/best-task-management-apps)
- [Toolfinder: Best to-do list apps 2026](https://toolfinder.com/best/to-do-list-apps)
- [Unstar: What power users complain about 2026](https://unstar.app/blog/productivity-app-reviews-what-power-users-complain-about-2026)
- [Capterra: Todoist reviews](https://www.capterra.com/p/149339/Todoist-for-Business/reviews/), [TickTick reviews](https://www.capterra.com/p/170641/TickTick/reviews/)
- [Morgen: Sunsama vs Akiflow](https://morgen.so/blog-posts/sunsama-vs-akiflow), [Asian Efficiency: best daily planner apps](https://www.asianefficiency.com/task-management/best-daily-planner-apps-ai/)
- [UX Collective: The rise of Linear style design](https://bootcamp.uxdesign.cc/the-rise-of-linear-style-design-origins-trends-and-techniques-4fd96aab7646)
- [Vercel Geist design system](https://vercel.com/geist), [Geist font](https://vercel.com/geist/font)
- Note: the hex values are adapted from community-extracted Linear/Vercel specs and are not official.
