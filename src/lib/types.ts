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

/** Who does the task: the human (Chief Human Officer) or one of the agent piles. */
export type Owner = 'human' | 'manager' | 'junior'
export type AgentRole = 'manager' | 'junior'
/** `auto` re-sorts when the title or tags change; `manual` (user override) never does. */
export type OwnerSource = 'auto' | 'manual'
export type AgentStatus = 'queued' | 'working' | 'review' | 'returned' | 'approved'

export interface AgentState {
  status: AgentStatus
  /** markdown deliverable written by the agent */
  output?: string
  /** agent's note (why it was returned) or the CHO's "send back" feedback */
  note?: string
  updatedAt: number
  by?: AgentRole
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
  owner: Owner
  ownerSource: OwnerSource
  /** short explanation, e.g. "Phone call → needs you" */
  sortReason: string
  agent?: AgentState
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
  | { kind: 'delegation' }
  | { kind: 'project'; id: string }

export interface Filters {
  query: string
  priorities: Priority[]
  tags: string[]
  energy: Energy | null
}

export type TaskDraft = Partial<Omit<Task, 'id' | 'createdAt' | 'order'>> & { title: string }

/** A file an agent writes to `piles/results/<taskId>.json`, as served by the dev bridge. */
export interface AgentResult {
  taskId: string
  status: 'review' | 'returned' | 'working'
  by: AgentRole
  /** markdown deliverable */
  output?: string
  note?: string
  /** a manager may hand a task to the junior pile, or anyone may hand it back to the human */
  owner?: Owner
  /** subtasks proposed by the agent; appended if not already present */
  subtasks?: string[]
  /** result file name (set by the bridge) */
  file?: string
}
