# piles/

This folder is the hand-off point between Lumen (the browser app) and Claude Code agents. Everything here except this README is personal task data and is git-ignored.

While `npm run dev` is running, the dev-server bridge (`plugins/piles.ts`) rewrites the queue files about a second after any task changes. In a production build there is no bridge: use **Delegation → Export** in the app and drop the files here yourself.

## Written by the app

| File | What it is |
|---|---|
| `queue.json` | Machine-readable queue of every **open** task (see below) |
| `human.md` | Checklist for you, the Chief Human Officer: returned tasks first |
| `manager.md` | Checklist for the Manager agent, grouped by agent status |
| `junior.md` | Checklist for the Junior agent, grouped by agent status |

Edit tasks in the app, not in these files. They are regenerated on every change.

### `queue.json`

```jsonc
{
  "app": "lumen",
  "version": 1,
  "generatedAt": "2026-11-20T09:30:00.000Z",
  "counts": { "human": 21, "manager": 4, "junior": 5 },
  "tasks": [
    {
      "id": "V1StGXR8_Z",            // use this as <taskId>
      "title": "Research standing desk options",
      "notes": "",
      "tags": ["research"],
      "project": null,                // project name or null
      "due": "2026-11-24",            // yyyy-MM-dd or null
      "dueTime": null,                // HH:mm or null
      "priority": 4,                  // 1 (high) … 4 (none)
      "owner": "manager",             // "human" | "manager" | "junior"
      "ownerSource": "auto",          // "auto" (rule-based) | "manual" (the user chose)
      "sortReason": "Research → Manager",
      "humanOnly": false,             // true = a hard human rule matched; agents must never act on it
      "subtasks": [{ "title": "…", "done": false }],
      "agent": {                      // null for most human tasks
        "status": "queued",           // queued | working | review | returned | approved
        "by": "manager",
        "note": "Shorter please",     // the user's feedback when a task was sent back
        "previousOutput": "…"         // last deliverable, present when sent back for a revision
      }
    }
  ]
}
```

## Written by agents

**Write every file atomically**: write `<name>.json.tmp` next to it, then rename it over `<name>.json` (`os.replace` in Python, `mv` in a shell). The app polls these files and must never see half-written JSON. Temp files (`*.tmp`) are ignored.

### Run progress (live status bar)

While a run is in progress the app shows a live status bar (which agent is on which task, phase, percent). It reads two kinds of files through `GET /api/piles/status`:

**`run.json`**, written by the orchestrator (the main Claude Code session running the `run-piles` skill) when the run starts, and rewritten at the end:

```jsonc
{
  "runId": "2026-11-20T14-00-03Z",      // any unique string; a new run = a new id
  "startedAt": "2026-11-20T14:00:03.000Z",
  "finishedAt": "2026-11-20T14:06:41.000Z",  // set when state leaves "running"
  "state": "running",                   // "running" | "finished" | "failed"
  "trigger": "manual",                  // "manual" (the user asked) | "scheduled" (9:00 / 14:00 task)
  "total": 3,
  "tasks": [
    { "taskId": "V1StGXR8_Z", "title": "Research standing desk options", "by": "manager" },
    { "taskId": "Uakgb_J5m9", "title": "Draft press kit", "by": "junior" }
  ]
}
```

**`status/<taskId>.json`**, written by each Manager/Junior subagent as it works:

```jsonc
{
  "taskId": "V1StGXR8_Z",
  "by": "manager",                      // "manager" | "junior"
  "phase": "Researching",               // short: Starting, Researching, Analysing, Drafting, Reviewing, Finishing…
  "percent": 50,                        // 0–100
  "message": "Comparing 3 desks",       // optional, one short line
  "updatedAt": "2026-11-20T14:02:10.000Z"
}
```

- Write it at meaningful milestones: **5** when starting, then roughly **25 / 50 / 75**, and **100** just before writing the result file.
- **Hires** on a Manager's team write `status/<taskId>.<hireId>.json` with `by: "senior" | "junior"` plus `"parentTaskId": "<taskId>", "hireId": "h1"`. The bar shows them nested under their Manager.
- A Manager task's percent **rolls up**: planning 0–15 (Manager), team at work 15–85 (average of its hires), review & assembly 85–100 (Manager).
- A status whose `updatedAt` is more than **15 minutes** old while the run is still `running` is shown as **Stalled?** (the expanded panel offers **Clear**, which deletes its status files and lists the task under `run.json → cleared`). A `running` run with no status update for **30 minutes** is treated as abandoned: the bar shows *Last run didn't finish* with **Dismiss**, which marks `run.json` `"state": "failed", "dismissed": true`.
- Status files older than the current run's `startedAt` are ignored. When the app acknowledges a task's result, the bridge deletes its `status/<taskId>.json`.
- `run.json` stays after the run (`finished`/`failed`) so the bar can show "Last run 2:04 PM · 5 done".
- Runs started from Lumen's **Run agents** button may also carry `"exitCode"` (the server closed the run after the orchestrator exited) and `"stoppedByUser": true` (the user pressed Stop).

Row states in the app: **Queued** (no status yet), **Working**, **Done** (result written, ready for review), **Returned to you**, **Stalled?**.

To try it without real agents: `npm run sim:run` (see `scripts/sim-run.ts`; `--fast`, `--scheduled`, `--stall`, `--no-results`, `--ids=`). It needs two queued Manager tasks and one queued Junior task in the queue and refuses to start otherwise. `npm run sim:clean` removes everything a simulation wrote (tracked in `.sim.json`); it never touches a real run.

### Teams (Manager hires)

The Manager can hire **Senior** and **Junior** agents for a task. Subagents can't spawn subagents, so the orchestrator runs it in three phases (see the run-piles skill): the Manager plans, the orchestrator spawns the hires, and the Manager reviews and assembles. Cost guardrail: at most 4 hires per task and one revision round per hire.

**`teams/<taskId>.json`**: the Manager's staffing plan.

```jsonc
{
  "taskId": "V1StGXR8_Z",
  "rationale": "Research needs judgement; the write-up is drafting",
  "hires": [
    { "hireId": "h1", "role": "senior", "title": "Senior research analyst", "brief": "…", "deliverable": "Ranked comparison" },
    { "hireId": "h2", "role": "junior", "title": "Junior writer", "brief": "…", "deliverable": "One-page summary", "dependsOn": ["h1"] }
  ]                                     // [] = the Manager works alone
}
```

**`teams/<taskId>/<hireId>.json`**: a hire's output: `{ "hireId", "role", "output": "<markdown>", "report": { … }, "startedAt", "finishedAt", "revision"?: 1 }`. `teams/<taskId>/review.json` (`{ "revisions": [{ "hireId", "feedback" }] }`) is the Manager's one-time revision request. The bridge attaches the hire outputs to the Manager's result, so the app can show each hire's own output and report.

### Results

One file per task: `results/<taskId>.json`

```jsonc
{
  "taskId": "V1StGXR8_Z",
  "status": "review",                 // "review" | "returned" | "working"
  "by": "manager",                    // "manager" | "junior"
  "output": "## Recommendation\n…",   // markdown deliverable (rendered in the app)
  "note": "Optional note to the user",
  "owner": "junior",                  // optional: hand the task to another pile ("human" = return it)
  "subtasks": ["Draft the comparison table", "…"],  // optional: appended to the task if new
  "report": { … }                     // detailed report, see below (optional for old results)
}
```

### The report

Every result carries a detailed `report` (results from before reports existed have none, and the app shows "No detailed report"):

```jsonc
{
  "summary": "2–3 sentences: what was asked, what was done, the outcome",
  "approach": ["Steps actually taken, in order"],
  "sources": [{ "title": "…", "url": "https://…", "note": "optional" }],   // only URLs actually consulted
  "assumptions": ["…"],
  "decisionsForYou": ["Open questions / what the CHO must decide or do"],
  "risks": ["Caveats, conflicting info"],             // optional
  "confidence": "high",                               // high | medium | low
  "confidenceReason": "One sentence",
  "model": "opus",
  "startedAt": "2026-11-20T14:00:05Z",
  "finishedAt": "2026-11-20T14:06:12Z",
  "handoffs": ["Handed drafting of X to Junior"],     // optional
  // Manager only:
  "team": [{ "hireId": "h1", "role": "senior", "title": "Senior research analyst", "model": "opus",
             "deliverable": "Ranked comparison", "durationSec": 184, "quality": "accepted", "note": "…" }],
  "hiringRationale": "Why this team (or why no one)"
}
```

## Written by the bridge (reports)

| File | What it is |
|---|---|
| `reports/YYYY-MM-DD/<taskId>-<slug>.md` | One per result: a header (task, agent, model, run, times, duration, confidence), every report section, the Team, the full deliverable and the hires' outputs. Written when the app picks the result up. |
| `reports/YYYY-MM-DD/run-HHMM.md` | One per run: every task with its agent, team size, outcome, time and confidence, what came back to you, and all open decisions. Written when the run ends. |

`node scripts/run-report.ts` (`npm run run:report`) regenerates both for the current `run.json`. The orchestrator runs it at the end of every run.

What the app does with a result (it polls every 5 s while the tab is visible):

- `review`: shown as **Ready for review** with the rendered output, plus a toast. You can Approve, Send back (with a note) or Take it over. Approving does not complete the task.
- `returned`: the task moves to your pile and the `note` becomes its reason. Explain what is prepared and what you must do.
- `working`: shows a **Working** pill. Optional progress signal.
- `owner: "junior"` from the manager: the task moves to the junior pile, queued, with the manager's output as the brief.
- `subtasks`: appended, skipping titles the task already has.

Processed files are moved to `results/processed/` (timestamped), so a task can receive a new result later. A browser only acknowledges results for tasks in **its own** store, so a second browser profile on the same dev server can't swallow them. A profile that had no Lumen data when it loaded never writes the queue (a genuinely empty queue from an initialised store is still written).

## Written by the dev server (Run button)

| File | What it is |
|---|---|
| `logs/run-<timestamp>.log` | Output of a run started with Lumen's **Run agents** button: the CLI's `stream-json` events plus `[lumen …]` lines from the server (start, task list, allow-list, exit code). The app shows it formatted (tool calls, subagents, errors). The last 20 are kept. |
| `logs/active.json` | The spawned orchestrator's `{ pid, startedAt, log }` while it runs, so a restarted dev server can still stop it |
| `logs/last-exit.json` | `{ code, signal, at, stoppedByUser, log, ok }` of the last Lumen-started run |

When a Lumen-started orchestrator exits, the server makes sure `run.json` never sticks on `running`: a non-zero exit, or an exit that left `run.json` running, marks it `"state": "failed"` with `"exitCode"`; **Stop** marks it `failed` with `"stoppedByUser": true`. If the process failed before writing `run.json`, the server writes a failed run with no tasks so the status bar shows it.

## Running the agents

In Claude Code, from the project root, say **"run the piles"** (see `.claude/skills/run-piles/SKILL.md`). Or press **Run agents** in Lumen's Delegation view: the dev server runs the same runbook headless (`claude -p`, Sonnet orchestrator, scoped allow-list; see the main README).

| Endpoint | Does |
|---|---|
| `GET /api/piles/run/state?lines=N` | `{ canRun, reason?, message?, selectable: [{ id, title, by }], active, runActive, pid?, startedAt?, log?, logTail, lastExit?, cli }`. `reason` is `running`, `nothing`, `no-queue` or `cli-missing`; `selectable` uses the runbook's selection rules |
| `POST /api/piles/run` | `{ taskIds?: string[] }` (a subset of `selectable`; all when omitted) → 202 `{ pid, startedAt, log, tasks }`; 409 `running` / `nothing` / `no-queue`; 500 `cli-missing` |
| `POST /api/piles/run/stop` | Kills the spawned process tree → 200; 409 when no Lumen-started run is active |

All three require the `X-Lumen-Run: 1` header and a localhost Host/Origin on the dev port; POSTs are refused from a `?bridge=read` tab (`X-Lumen-Mode: read`). Anything else gets 403.
