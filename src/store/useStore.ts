import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type {
  HireOutput,
  StoredReport,
  AgentResult,
  AgentState,
  DateKey,
  DayActivity,
  FocusSession,
  Owner,
  OwnerSource,
  Project,
  Settings,
  Status,
  Task,
  TaskDraft,
  Theme,
} from '../lib/types'
import { normalizeHire, normalizeReport } from '../lib/reportMd'
import { nextOccurrence } from '../lib/recurrence'
import { buildSeed } from '../lib/seed'
import { autoOwnerFields, classify, OWNER_LABEL } from '../lib/delegate'
import { isToday, isValidKey, PROJECT_COLORS, todayKey, toKey } from '../lib/utils'

export const SCHEMA_VERSION = 3
export const STORAGE_KEY = 'lumen:store'

export interface DataState {
  schemaVersion: number
  tasks: Task[]
  projects: Project[]
  activity: Record<DateKey, DayActivity>
  /** demo history lives apart so "Clear demo data" never touches real activity */
  demoActivity: Record<DateKey, DayActivity>
  sessions: FocusSession[]
  journal: Record<DateKey, string>
  settings: Settings
  lastPlanned: DateKey | null
  lastShutdown: DateKey | null
  seeded: boolean
}

export interface Actions {
  addTask: (draft: TaskDraft) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => Task | undefined
  toggleComplete: (id: string) => { completed: boolean; clearedToday: boolean }
  setStatus: (id: string, status: Status) => void
  setOrder: (ids: string[]) => void
  addSubtask: (taskId: string, title: string) => void
  toggleSubtask: (taskId: string, subId: string) => void
  updateSubtask: (taskId: string, subId: string, title: string) => void
  deleteSubtask: (taskId: string, subId: string) => void
  addProject: (name: string, color?: string) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  logFocus: (taskId: string | null, minutes: number) => void
  planDay: (ids: string[]) => void
  rollOver: (ids: string[]) => void
  markShutdown: (note: string) => void
  setSettings: (patch: Partial<Settings>) => void
  toggleTheme: () => void
  importData: (raw: unknown) => { ok: true; count: number } | { ok: false; error: string }
  clearDemo: () => void
  resetAll: () => void
  undo: () => boolean
  canUndo: () => boolean
  // ── Delegation ──
  /** Manual override. Refused (ok: false) when a hard human rule forbids agents taking the task. */
  setOwner: (id: string, owner: Owner) => { ok: true } | { ok: false; reason: string }
  /** Hand the task back to auto-sort. */
  resetOwner: (id: string) => void
  /** Re-run auto-sort on every open, auto-sorted task. Returns how many moved pile. */
  resortAll: () => number
  approveAgent: (id: string) => void
  sendBackAgent: (id: string, note: string) => void
  takeOver: (id: string) => void
  applyAgentResults: (results: AgentResult[]) => { review: string[]; returned: string[]; working: string[]; handed: string[] }
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  name: '',
  dailyCap: 6,
  pomodoro: { work: 25, short: 5, long: 15 },
  confetti: true,
  sidebarCollapsed: false,
}

function freshState(seed: boolean): DataState {
  const s = seed ? buildSeed() : { tasks: [], projects: [], demoActivity: {} }
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: s.tasks,
    projects: s.projects,
    activity: {},
    demoActivity: s.demoActivity,
    sessions: [],
    journal: {},
    settings: { ...DEFAULT_SETTINGS },
    lastPlanned: null,
    lastShutdown: null,
    seeded: seed,
  }
}

// ── Undo: a small in-memory snapshot stack (not persisted) ──
type Snapshot = Pick<DataState, 'tasks' | 'activity' | 'demoActivity' | 'projects'>
const undoStack: Snapshot[] = []

function bump(map: Record<DateKey, DayActivity>, key: DateKey, field: keyof DayActivity, delta: number) {
  const cur = map[key] ?? { done: 0, planned: 0, focus: 0 }
  return { ...map, [key]: { ...cur, [field]: Math.max(0, cur[field] + delta) } }
}

const OWNERS: Owner[] = ['human', 'manager', 'junior']
const AGENT_STATUSES = ['queued', 'working', 'review', 'returned', 'approved'] as const

/** reports kept per task (oldest dropped first) */
const MAX_REPORTS = 12

function shorten(s: string, n = 90) {
  const first = s.trim().split(/(?<=[.!?])\s/)[0] ?? s
  return first.length > n ? first.slice(0, n - 1) + '…' : first
}

/** Move a task to a pile. Agent piles start (or restart) at `queued`; moving to you keeps any output for reference. */
function moveTo(t: Task, owner: Owner, source: OwnerSource, reason: string): Task {
  const now = Date.now()
  if (owner === t.owner) {
    const agent = owner !== 'human' && !t.agent ? { status: 'queued' as const, updatedAt: now } : t.agent
    return { ...t, ownerSource: source, sortReason: reason, agent }
  }
  let agent: AgentState | undefined
  if (owner !== 'human') agent = { status: 'queued', updatedAt: now }
  else if (t.agent?.output) agent = { ...t.agent, status: 'returned', updatedAt: now }
  return { ...t, owner, ownerSource: source, sortReason: reason, agent }
}

export const useStore = create<DataState & Actions>()(
  persist(
    (set, get) => {
      const snapshot = () => {
        const { tasks, activity, demoActivity, projects } = get()
        undoStack.push({ tasks, activity, demoActivity, projects })
        if (undoStack.length > 30) undoStack.shift()
      }
      const patchTask = (id: string, fn: (t: Task) => Task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }))
      const projectName = (id: string | null) => (id ? get().projects.find((p) => p.id === id)?.name : undefined)
      const sortOf = (t: Pick<Task, 'title' | 'tags' | 'projectId'>) =>
        classify({ title: t.title, tags: t.tags, project: projectName(t.projectId) })

      return {
        ...freshState(true),

        addTask: (draft) => {
          const id = nanoid(10)
          const order = Math.max(0, ...get().tasks.map((t) => t.order)) + 1
          const task: Task = {
            id,
            notes: '',
            due: null,
            dueTime: null,
            priority: 4,
            tags: [],
            projectId: null,
            energy: null,
            estimate: null,
            subtasks: [],
            recurrence: null,
            status: 'todo',
            completedAt: null,
            plannedFor: null,
            focusMinutes: 0,
            ...draft,
            title: draft.title.trim() || 'Untitled',
            createdAt: new Date().toISOString(),
            order,
            owner: 'human',
            ownerSource: 'auto',
            sortReason: '',
          }
          // Delegation: an explicit owner (quick-add ^me/^mgr/^jr) wins unless a hard human rule forbids it.
          const sorted = sortOf(task)
          if (draft.owner && (draft.owner === 'human' || !sorted.locked)) {
            task.owner = draft.owner
            task.ownerSource = draft.ownerSource ?? 'manual'
            task.sortReason = draft.sortReason ?? (draft.owner === 'human' ? 'Kept by you' : `Delegated by you → ${OWNER_LABEL[draft.owner]}`)
          } else {
            task.owner = sorted.owner
            task.ownerSource = 'auto'
            task.sortReason = sorted.reason
          }
          task.agent = task.owner !== 'human' ? { status: 'queued', updatedAt: Date.now() } : undefined
          set((s) => ({ tasks: [...s.tasks, task] }))
          return id
        },

        updateTask: (id, patch) =>
          patchTask(id, (t) => {
            const next = { ...t, ...patch }
            if ('owner' in patch) return next
            const changed =
              (patch.title !== undefined && patch.title !== t.title) ||
              (patch.tags !== undefined && patch.tags.join() !== t.tags.join()) ||
              (patch.projectId !== undefined && patch.projectId !== t.projectId)
            if (!changed) return next
            const r = sortOf(next)
            // auto-sorted tasks follow their title/tags; any task that becomes human-only leaves the agent piles
            if (t.ownerSource === 'auto') return moveTo(next, r.owner, 'auto', r.reason)
            if (r.locked && next.owner !== 'human') return moveTo(next, 'human', 'auto', r.reason)
            return next
          }),

        deleteTask: (id) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t) return undefined
          snapshot()
          set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) }))
          return t
        },

        toggleComplete: (id) => {
          const s = get()
          const t = s.tasks.find((x) => x.id === id)
          if (!t) return { completed: false, clearedToday: false }
          snapshot()
          const today = todayKey()
          if (t.status === 'done') {
            const k = t.completedAt ? toKey(new Date(t.completedAt)) : today
            set((st) => ({
              tasks: st.tasks.map((x) => (x.id === id ? { ...x, status: 'todo', completedAt: null } : x)),
              activity: bump(st.activity, k, 'done', -1),
            }))
            return { completed: false, clearedToday: false }
          }
          const wasToday = isToday(t, today)
          const now = new Date().toISOString()
          const tasks = s.tasks.map((x) =>
            x.id === id ? { ...x, status: 'done' as const, completedAt: now, plannedFor: x.plannedFor ?? (wasToday ? today : null) } : x,
          )
          if (t.recurrence) {
            tasks.push({
              ...t,
              id: nanoid(10),
              status: 'todo',
              completedAt: null,
              plannedFor: null,
              focusMinutes: 0,
              subtasks: t.subtasks.map((st) => ({ ...st, done: false })),
              due: nextOccurrence(t.recurrence, t.due),
              createdAt: now,
              order: Math.max(...s.tasks.map((x) => x.order)) + 1,
              agent: t.owner !== 'human' ? { status: 'queued', updatedAt: Date.now() } : undefined,
            })
          }
          set({ tasks, activity: bump(s.activity, today, 'done', 1) })
          const clearedToday = wasToday && !tasks.some((x) => isToday(x, today))
          return { completed: true, clearedToday }
        },

        setStatus: (id, status) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t || t.status === status) return
          if (status === 'done' || t.status === 'done') {
            get().toggleComplete(id)
            if (status !== 'done' && status !== 'todo') patchTask(id, (x) => ({ ...x, status }))
            return
          }
          patchTask(id, (x) => ({ ...x, status }))
        },

        setOrder: (ids) => {
          const orders = new Map(ids.map((id, i) => [id, i]))
          set((s) => ({ tasks: s.tasks.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id)! } : t)) }))
        },

        addSubtask: (taskId, title) =>
          patchTask(taskId, (t) => ({ ...t, subtasks: [...t.subtasks, { id: nanoid(8), title, done: false }] })),
        toggleSubtask: (taskId, subId) =>
          patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s)) })),
        updateSubtask: (taskId, subId, title) =>
          patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, title } : s)) })),
        deleteSubtask: (taskId, subId) => patchTask(taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) })),

        addProject: (name, color) => {
          const id = nanoid(8)
          const used = get().projects.length
          set((s) => ({
            projects: [
              ...s.projects,
              {
                id,
                name: name.trim() || 'Untitled',
                color: color ?? PROJECT_COLORS[used % PROJECT_COLORS.length],
                createdAt: new Date().toISOString(),
              },
            ],
          }))
          return id
        },
        updateProject: (id, patch) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        deleteProject: (id) => {
          snapshot()
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
          }))
        },

        logFocus: (taskId, minutes) => {
          if (minutes <= 0) return
          const today = todayKey()
          set((s) => ({
            activity: bump(s.activity, today, 'focus', minutes),
            sessions: [...s.sessions.slice(-499), { id: nanoid(8), taskId, start: new Date().toISOString(), minutes }],
            tasks: taskId ? s.tasks.map((t) => (t.id === taskId ? { ...t, focusMinutes: t.focusMinutes + minutes } : t)) : s.tasks,
          }))
        },

        planDay: (ids) => {
          const today = todayKey()
          const set_ = new Set(ids)
          set((s) => {
            const tasks = s.tasks.map((t) => {
              if (set_.has(t.id)) return { ...t, plannedFor: today }
              // un-plan things deselected during the ritual (but keep their due date)
              if (t.plannedFor === today && t.status !== 'done') return { ...t, plannedFor: null }
              return t
            })
            const planned = tasks.filter((t) => isToday(t, today) || (t.plannedFor === today && t.status === 'done')).length
            const cur = s.activity[today] ?? { done: 0, planned: 0, focus: 0 }
            return { tasks, lastPlanned: today, activity: { ...s.activity, [today]: { ...cur, planned } } }
          })
        },

        rollOver: (ids) => {
          const tomorrow = toKey(new Date(Date.now() + 86400000))
          const set_ = new Set(ids)
          set((s) => ({
            tasks: s.tasks.map((t) =>
              set_.has(t.id) ? { ...t, plannedFor: tomorrow, due: t.due && t.due < tomorrow ? tomorrow : t.due } : t,
            ),
          }))
        },

        markShutdown: (note) => {
          const today = todayKey()
          set((s) => ({ lastShutdown: today, journal: note.trim() ? { ...s.journal, [today]: note.trim() } : s.journal }))
        },

        setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
        toggleTheme: () => set((s) => ({ settings: { ...s.settings, theme: (s.settings.theme === 'dark' ? 'light' : 'dark') as Theme } })),

        importData: (raw) => {
          try {
            const obj = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<DataState> & { state?: Partial<DataState> }
            const data = obj.state ?? obj
            if (!data || !Array.isArray(data.tasks)) return { ok: false, error: 'No tasks found in file.' }
            const tasks = data.tasks.filter((t): t is Task => !!t && typeof t.id === 'string' && typeof t.title === 'string')
            snapshot()
            set({
              ...migrate({ ...freshState(false), ...data, tasks }),
              settings: { ...DEFAULT_SETTINGS, ...get().settings, ...(data.settings ?? {}) },
            })
            return { ok: true, count: tasks.length }
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : 'Could not read file.' }
          }
        },

        clearDemo: () => {
          snapshot()
          set((s) => ({
            tasks: s.tasks.filter((t) => !t.demo),
            projects: s.projects.filter((p) => !p.demo),
            demoActivity: {},
          }))
        },

        resetAll: () => {
          undoStack.length = 0
          set({ ...freshState(false), settings: { ...get().settings } })
        },

        undo: () => {
          const snap = undoStack.pop()
          if (!snap) return false
          set(snap)
          return true
        },
        canUndo: () => undoStack.length > 0,

        // ── Delegation ──
        setOwner: (id, owner) => {
          const t = get().tasks.find((x) => x.id === id)
          if (!t) return { ok: false, reason: 'Task not found' }
          const r = sortOf(t)
          if (owner !== 'human' && r.locked) return { ok: false, reason: r.reason }
          if (t.owner === owner && t.ownerSource === 'manual') return { ok: true }
          const reason = owner === 'human' ? 'Kept by you' : `Delegated by you → ${OWNER_LABEL[owner]}`
          patchTask(id, (x) => moveTo(x, owner, 'manual', reason))
          return { ok: true }
        },

        resetOwner: (id) =>
          patchTask(id, (t) => {
            const r = sortOf(t)
            return moveTo(t, r.owner, 'auto', r.reason)
          }),

        resortAll: () => {
          snapshot()
          let moved = 0
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.status === 'done' || t.ownerSource !== 'auto') return t
              const r = sortOf(t)
              if (r.owner !== t.owner) moved++
              return moveTo(t, r.owner, 'auto', r.reason)
            }),
          }))
          return moved
        },

        approveAgent: (id) =>
          patchTask(id, (t) => (t.agent ? { ...t, agent: { ...t.agent, status: 'approved', updatedAt: Date.now() } } : t)),

        sendBackAgent: (id, note) =>
          patchTask(id, (t) => ({
            ...t,
            agent: { ...(t.agent ?? {}), status: 'queued', note: note.trim() || undefined, updatedAt: Date.now() },
          })),

        takeOver: (id) => patchTask(id, (t) => moveTo(t, 'human', 'manual', 'You took this over')),

        applyAgentResults: (results) => {
          const out = { review: [] as string[], returned: [] as string[], working: [] as string[], handed: [] as string[] }
          if (!results.length) return out
          const byId = new Map(results.map((r) => [r.taskId, r]))
          const now = Date.now()
          set((s) => ({
            tasks: s.tasks.map((t) => {
              const r = byId.get(t.id)
              // finished or already-approved work is never overwritten by a late result
              if (!r || t.status === 'done' || t.agent?.status === 'approved') return t
              let next: Task = { ...t }
              if (r.subtasks?.length) {
                const have = new Set(t.subtasks.map((x) => x.title.trim().toLowerCase()))
                const add = r.subtasks
                  .map((x) => String(x).trim())
                  .filter((x) => x && !have.has(x.toLowerCase()))
                  .map((title) => ({ id: nanoid(8), title, done: false }))
                next.subtasks = [...t.subtasks, ...add]
              }
              const report = normalizeReport(r.report)
              const hires = (r.hires ?? []).map((h) => normalizeHire(h)).filter((h): h is HireOutput => !!h)
              const extra = { report, hires: hires.length ? hires : undefined }
              if (r.status === 'working') {
                next.agent = { ...(t.agent ?? {}), status: 'working', by: r.by, updatedAt: now }
                out.working.push(t.id)
              } else if (r.status === 'returned' || r.owner === 'human') {
                next = {
                  ...next,
                  owner: 'human',
                  ownerSource: 'manual',
                  sortReason: r.note ? shorten(r.note) : 'Returned by the agent',
                  agent: { status: 'returned', output: r.output, note: r.note, by: r.by, updatedAt: now, ...extra },
                }
                out.returned.push(t.id)
              } else if (r.owner && r.owner !== t.owner && !sortOf(t).locked) {
                // e.g. the manager planned it and hands the drafting to the junior pile
                next = {
                  ...next,
                  owner: r.owner,
                  ownerSource: 'manual',
                  sortReason: `Handed to ${OWNER_LABEL[r.owner]} by ${OWNER_LABEL[r.by]}`,
                  agent: { status: 'queued', output: r.output, note: r.note, by: r.by, updatedAt: now, ...extra },
                }
                out.handed.push(t.id)
              } else {
                next.agent = { status: 'review', output: r.output ?? '', note: r.note, by: r.by, updatedAt: now, ...extra }
                out.review.push(t.id)
              }
              if (report && r.status !== 'working') {
                const kind: StoredReport['status'] = next.agent?.status === 'returned' ? 'returned' : next.agent?.status === 'queued' ? 'handed' : 'review'
                const entry: StoredReport = {
                  id: nanoid(8),
                  by: r.by,
                  status: kind,
                  output: r.output ?? '',
                  note: r.note,
                  report,
                  hires: extra.hires,
                  runId: r.runId,
                  runStartedAt: r.runStartedAt,
                  receivedAt: now,
                }
                next.reports = [...(t.reports ?? []), entry].slice(-MAX_REPORTS)
              }
              return next
            }),
          }))
          return out
        },
      }
    },
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): DataState => ({
        schemaVersion: s.schemaVersion,
        tasks: s.tasks,
        projects: s.projects,
        activity: s.activity,
        demoActivity: s.demoActivity,
        sessions: s.sessions,
        journal: s.journal,
        settings: s.settings,
        lastPlanned: s.lastPlanned,
        lastShutdown: s.lastShutdown,
        seeded: s.seeded,
      }),
      migrate: (persisted, version) => {
        // v0 → v1: no prior public schema; normalise whatever is there.
        // v1 → v2: delegation fields (owner, ownerSource, sortReason, agent) are added by auto-sort in migrate().
        // v2 → v3: optional agent reports (task.reports, agent.report, agent.hires) are validated in migrate().
        void version
        return migrate(persisted as Partial<DataState>)
      },
    },
  ),
)

/** Normalise / upgrade any persisted or imported payload to the current schema. */
function migrate(d: Partial<DataState>): DataState {
  const base = freshState(false)
  const projects = d.projects ?? []
  const tasks = ((d.tasks ?? []) as Partial<Task>[]).map((t, i) => ({
    notes: '',
    dueTime: null,
    tags: [],
    projectId: null,
    energy: null,
    estimate: null,
    subtasks: [],
    recurrence: null,
    completedAt: null,
    plannedFor: null,
    focusMinutes: 0,
    order: i,
    createdAt: new Date().toISOString(),
    ...t,
    due: isValidKey(t.due) ? t.due : null,
    priority: t.priority && [1, 2, 3, 4].includes(t.priority) ? t.priority : 4,
    status: t.status === 'done' || t.status === 'doing' ? t.status : 'todo',
    // v1 → v2: delegation. Tasks without an owner are auto-sorted into a pile.
    ...migrateOwner(t, projects),
    // v2 → v3: detailed agent reports (optional; dropped if malformed)
    reports: Array.isArray(t.reports) ? t.reports.filter((x) => x && typeof x === 'object' && x.report && typeof x.report.summary === 'string') : undefined,
  })) as Task[]
  return {
    ...base,
    ...d,
    schemaVersion: SCHEMA_VERSION,
    tasks,
    projects,
    activity: d.activity ?? {},
    demoActivity: d.demoActivity ?? {},
    sessions: d.sessions ?? [],
    journal: d.journal ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    seeded: d.seeded ?? true,
  }
}

function migrateOwner(t: Partial<Task>, projects: Project[]): Pick<Task, 'owner' | 'ownerSource' | 'sortReason' | 'agent'> {
  const agent =
    t.agent && typeof t.agent === 'object' && AGENT_STATUSES.includes(t.agent.status)
      ? { ...t.agent, updatedAt: typeof t.agent.updatedAt === 'number' ? t.agent.updatedAt : Date.now() }
      : undefined
  if (t.owner && OWNERS.includes(t.owner)) {
    return {
      owner: t.owner,
      ownerSource: t.ownerSource === 'manual' ? 'manual' : 'auto',
      sortReason: typeof t.sortReason === 'string' ? t.sortReason : '',
      agent: t.owner !== 'human' && !agent ? { status: 'queued', updatedAt: Date.now() } : agent,
    }
  }
  const project = t.projectId ? projects.find((p) => p.id === t.projectId)?.name : undefined
  const f = autoOwnerFields({ title: t.title ?? '', tags: t.tags ?? [], project })
  return { ...f, agent: f.owner !== 'human' ? { status: 'queued', updatedAt: Date.now() } : undefined }
}

export function exportData(): string {
  const s = useStore.getState()
  const data: DataState & { exportedAt: string; app: string } = {
    app: 'lumen',
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    tasks: s.tasks,
    projects: s.projects,
    activity: s.activity,
    demoActivity: s.demoActivity,
    sessions: s.sessions,
    journal: s.journal,
    settings: s.settings,
    lastPlanned: s.lastPlanned,
    lastShutdown: s.lastShutdown,
    seeded: s.seeded,
  }
  return JSON.stringify(data, null, 2)
}
