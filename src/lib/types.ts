export type Priority = 1 | 2 | 3 | 4
export type Energy = 'high' | 'low'
export type Status = 'todo' | 'doing' | 'done'
export type Theme = 'dark' | 'light'

/** yyyy-MM-dd */
export type DateKey = string

export type RecurrenceType = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'interval'

export interface Recurrence {
  type: RecurrenceType
  /** for `interval`: every N days. */
  interval?: number
  /** for `weekly`: 0 (Sun) – 6 (Sat). */
  weekday?: number
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  notes: string
  due: DateKey | null
  /** HH:mm */
  dueTime: string | null
  priority: Priority
  tags: string[]
  projectId: string | null
  energy: Energy | null
  /** estimated minutes */
  estimate: number | null
  subtasks: Subtask[]
  recurrence: Recurrence | null
  status: Status
  /** ISO timestamp */
  completedAt: string | null
  createdAt: string
  /** day this task was planned onto the "Today" list */
  plannedFor: DateKey | null
  order: number
  focusMinutes: number
  demo?: boolean
}

export interface Project {
  id: string
  name: string
  color: string
  createdAt: string
  demo?: boolean
}

export interface DayActivity {
  done: number
  planned: number
  focus: number
}

export interface FocusSession {
  id: string
  taskId: string | null
  start: string
  minutes: number
}

export interface Settings {
  theme: Theme
  name: string
  dailyCap: number
  pomodoro: { work: number; short: number; long: number }
  confetti: boolean
  sidebarCollapsed: boolean
}

export type ViewId =
  | { kind: 'dashboard' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'logbook' }
  | { kind: 'matrix' }
  | { kind: 'board' }
  | { kind: 'project'; id: string }

export interface Filters {
  query: string
  priorities: Priority[]
  tags: string[]
  energy: Energy | null
}

export type TaskDraft = Partial<Omit<Task, 'id' | 'createdAt' | 'order'>> & { title: string }
