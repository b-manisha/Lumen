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

One file per task: `results/<taskId>.json`

```jsonc
{
  "taskId": "V1StGXR8_Z",
  "status": "review",                 // "review" | "returned" | "working"
  "by": "manager",                    // "manager" | "junior"
  "output": "## Recommendation\n…",   // markdown deliverable (rendered in the app)
  "note": "Optional note to the user",
  "owner": "junior",                  // optional: hand the task to another pile ("human" = return it)
  "subtasks": ["Draft the comparison table", "…"]  // optional: appended to the task if new
}
```

What the app does with a result (it polls every 5 s while the tab is visible):

- `review`: shown as **Ready for review** with the rendered output, plus a toast. You can Approve, Send back (with a note) or Take it over. Approving does not complete the task.
- `returned`: the task moves to your pile and the `note` becomes its reason. Explain what is prepared and what you must do.
- `working`: shows a **Working** pill. Optional progress signal.
- `owner: "junior"` from the manager: the task moves to the junior pile, queued, with the manager's output as the brief.
- `subtasks`: appended, skipping titles the task already has.

Processed files are moved to `results/processed/` (timestamped), so a task can receive a new result later.

## Running the agents

In Claude Code, from the project root, say **"run the piles"** (see `.claude/skills/run-piles/SKILL.md`).
