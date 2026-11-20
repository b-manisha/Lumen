import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { DateKey, DayActivity, FocusSession, Project, Settings, Status, Task, TaskDraft, Theme } from '../lib/types'
import { nextOccurrence } from '../lib/recurrence'
import { buildSeed } from '../lib/seed'
import { isToday, isValidKey, PROJECT_COLORS, todayKey, toKey } from '../lib/utils'

export const SCHEMA_VERSION = 1
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

export const useStore = create<DataState & Actions>()(
  persist(
    (set, get) => {
      const snapshot = () => {
        const { tasks, activity, demoActivity, projects } = get()
        undoStack.push({ tasks, activity, demoActivity, projects })
        if (undoStack.length > 30) undoStack.shift()
      }
      const patchTask = (id: string, fn: (t: Task) => Task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? fn(t) : t)) }))

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
          }
          set((s) => ({ tasks: [...s.tasks, task] }))
          return id
        },

        updateTask: (id, patch) => patchTask(id, (t) => ({ ...t, ...patch })),

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
        void version
        return migrate(persisted as Partial<DataState>)
      },
    },
  ),
)

/** Normalise / upgrade any persisted or imported payload to the current schema. */
function migrate(d: Partial<DataState>): DataState {
  const base = freshState(false)
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
  })) as Task[]
  return {
    ...base,
    ...d,
    schemaVersion: SCHEMA_VERSION,
    tasks,
    projects: d.projects ?? [],
    activity: d.activity ?? {},
    demoActivity: d.demoActivity ?? {},
    sessions: d.sessions ?? [],
    journal: d.journal ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    seeded: d.seeded ?? true,
  }
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
