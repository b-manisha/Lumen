/**
 * Live progress of an agent run (see plugins/piles.ts → GET /api/piles/status and piles/README.md).
 *
 * The orchestrator writes `piles/run.json`; each Manager/Junior subagent writes
 * `piles/status/<taskId>.json` at milestones. This module polls the bridge (every 3s while a run is
 * active, every 10s when idle, paused while the tab is hidden) and derives one row per task in the run.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import type { AgentRole, HireRole, Task } from './types'
import { BRIDGE_AVAILABLE, pollResults } from './bridge'

/** Local times of the scheduled "Run the Lumen delegation piles" task. */
export const SCHEDULE: readonly (readonly [hour: number, minute: number])[] = [
  [9, 0],
  [14, 0],
]

const POLL_ACTIVE = 3000
const POLL_IDLE = 10_000

export type RunState = 'running' | 'finished' | 'failed'
export type RunTrigger = 'manual' | 'scheduled'

export interface RunInfo {
  runId: string
  startedAt: string
  finishedAt?: string
  state: RunState
  trigger: RunTrigger
  total: number
  tasks: { taskId: string; title: string; by: AgentRole }[]
  /** still `running` but nothing has moved for an hour: the orchestrator probably died */
  abandoned: boolean
  /** piles/-relative path of the run summary report (set once the run has ended) */
  summaryPath?: string
  /** the user dismissed this (abandoned) run */
  dismissed?: boolean
  /** task ids the user cleared from the run */
  cleared?: string[]
}

export interface LiveStatus {
  taskId: string
  by: AgentRole | 'senior'
  phase: string
  /** for a manager task with hires: rolled up from its phases and its hires */
  percent: number
  /** the manager's own percent before the roll-up */
  ownPercent?: number
  message?: string
  updatedAt: string
  stale: boolean
  /** hire statuses only */
  parentTaskId?: string
  hireId?: string
}

export interface TeamHire {
  hireId: string
  role: HireRole
  title: string
  brief: string
  deliverable: string
  dependsOn?: string[]
  /** wrote piles/teams/<taskId>/<hireId>.json */
  done: boolean
  revised: boolean
}

export interface TeamInfo {
  rationale: string
  hires: TeamHire[]
}

interface StatusResponse {
  now: number
  run: RunInfo | null
  statuses: LiveStatus[]
  teams: Record<string, TeamInfo>
  results: { taskId: string; status: string; by?: string; at: number }[]
  timing: Record<string, { start: number; end?: number }>
}

type Conn = 'checking' | 'connected' | 'offline'

interface RunStore {
  conn: Conn
  run: RunInfo | null
  /** keyed by taskId, or `${taskId}.${hireId}` for a hire */
  statuses: Record<string, LiveStatus>
  /** Manager staffing plans of the current run, keyed by taskId */
  teams: Record<string, TeamInfo>
  results: Record<string, { status: string; at: number }>
  timing: Record<string, { start: number; end?: number }>
  /** server clock minus client clock, so elapsed times are right even with a skewed clock */
  skew: number
}

export const useRun = create<RunStore>()(() => ({
  conn: BRIDGE_AVAILABLE ? 'checking' : 'offline',
  run: null,
  statuses: {},
  teams: {},
  results: {},
  timing: {},
  skew: 0,
}))

if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

export const isRunActive = (run: RunInfo | null) => !!run && run.state === 'running' && !run.abandoned

let inflight = false

export async function pollRunStatus(): Promise<void> {
  if (!BRIDGE_AVAILABLE || inflight) return
  inflight = true
  try {
    const res = await fetch('/api/piles/status', { cache: 'no-store' })
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) throw new Error(`Bridge ${res.status}`)
    const data = (await res.json()) as StatusResponse & { ok?: boolean }
    if (!data.ok) throw new Error('Bridge error')
    const prev = useRun.getState()
    const statuses = Object.fromEntries(data.statuses.map((s) => [s.hireId ? `${s.taskId}.${s.hireId}` : s.taskId, s]))
    const teams = data.teams ?? {}
    const results = Object.fromEntries(data.results.map((r) => [r.taskId, { status: r.status, at: r.at }]))
    useRun.setState({
      conn: 'connected',
      run: data.run,
      statuses: JSON.stringify(statuses) === JSON.stringify(prev.statuses) ? prev.statuses : statuses,
      results: JSON.stringify(results) === JSON.stringify(prev.results) ? prev.results : results,
      teams: JSON.stringify(teams) === JSON.stringify(prev.teams) ? prev.teams : teams,
      timing: JSON.stringify(data.timing) === JSON.stringify(prev.timing) ? prev.timing : data.timing,
      skew: data.now - Date.now(),
    })
    // a finished deliverable is waiting: pick it up now rather than on the next results poll
    if (data.results.length) void pollResults()
  } catch {
    if (useRun.getState().conn !== 'offline') useRun.setState({ conn: 'offline' })
  } finally {
    inflight = false
  }
}

async function post(url: string, body: unknown) {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  } finally {
    await pollRunStatus()
  }
}

/** Mark an abandoned run as failed (dismissed) so the bar stops showing it. */
export const dismissRun = (runId: string) => post('/api/piles/run/dismiss', { runId })
/** Drop a stalled task from the current run (its status files are removed). */
export const clearStalled = (runId: string, taskId: string) => post('/api/piles/status/clear', { runId, taskId })

/** A display title for a run task: the store's title, else the run's (never a raw id). */
export function displayTitle(storeTitle: string | undefined, runTitle: string | undefined, taskId: string): string {
  if (storeTitle?.trim()) return storeTitle
  const t = runTitle?.trim() ?? ''
  if (!t || t === taskId || t === `Task ${taskId}` || t.includes(taskId)) return 'Untitled task'
  return t
}

/** Mount once (App). Polls fast while a run is active, slowly when idle, never while hidden. */
export function useRunPolling() {
  useEffect(() => {
    if (!BRIDGE_AVAILABLE) return
    let timer: number | undefined
    let alive = true
    const schedule = () => {
      window.clearTimeout(timer)
      if (!alive || document.visibilityState !== 'visible') return
      timer = window.setTimeout(tick, isRunActive(useRun.getState().run) ? POLL_ACTIVE : POLL_IDLE)
    }
    const tick = () => void pollRunStatus().finally(schedule)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
      else window.clearTimeout(timer)
    }
    tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}

/** Live status for a task while an agent is working on it (undefined otherwise). */
export function useLiveStatus(taskId: string): LiveStatus | undefined {
  return useRun((s) => {
    if (!isRunActive(s.run)) return undefined
    const st = s.statuses[taskId]
    return st && st.percent < 100 && !s.results[taskId] ? st : undefined
  })
}

/** Hires of a manager task while its run is active (for the stacked avatars on Delegation cards). */
export function useLiveTeam(taskId: string): TeamHire[] | undefined {
  return useRun((s) => (isRunActive(s.run) && !s.results[taskId] ? s.teams[taskId]?.hires : undefined))
}

// ── Derived rows ──

export type RowState = 'queued' | 'working' | 'done' | 'returned' | 'stalled'

export interface HireRow {
  hireId: string
  role: HireRole
  title: string
  deliverable: string
  state: RowState | 'revising'
  percent: number
  phase?: string
  message?: string
  elapsed?: number
  dependsOn?: string[]
}

export interface RunRow {
  /** manager tasks that hired a team */
  hires?: HireRow[]
  rationale?: string
  taskId: string
  title: string
  by: AgentRole
  state: RowState
  percent: number
  phase?: string
  message?: string
  /** ms since the task started (or until it finished) */
  elapsed?: number
  updatedAt?: number
}

export const ROW_LABEL: Record<RowState, string> = {
  queued: 'Queued',
  working: 'Working',
  done: 'Ready for review',
  returned: 'Returned to you',
  stalled: 'Stalled?',
}

/** One row per task of the run: merges run.json, live status files, pending results and the app's own task state. */
type RowInputs = Pick<RunStore, 'run' | 'statuses' | 'results' | 'timing' | 'skew' | 'teams'>

/** Live rows for a manager task's hires (empty when it hired no one or has no plan yet). */
export function hireRows(s: RowInputs, taskId: string, serverNow: number, taskDone: boolean): HireRow[] {
  const team = s.teams[taskId]
  if (!team) return []
  return team.hires.map((h) => {
    const st = s.statuses[`${taskId}.${h.hireId}`]
    const time = s.timing[`${taskId}.${h.hireId}`]
    const row: HireRow = { hireId: h.hireId, role: h.role, title: h.title, deliverable: h.deliverable, dependsOn: h.dependsOn, state: 'queued', percent: 0 }
    if (st) Object.assign(row, { phase: st.phase, message: st.message, percent: st.percent })
    const back = st && st.percent < 100 && h.done // a delivered hire working again = revision round
    if (taskDone || (h.done && !back)) row.state = 'done'
    else if (st) row.state = st.stale ? 'stalled' : back || /revis/i.test(st.phase) ? 'revising' : st.percent >= 100 ? 'done' : 'working'
    if (row.state === 'done') row.percent = 100
    const live = row.state === 'working' || row.state === 'revising' || row.state === 'stalled'
    if (time && (time.end || live)) row.elapsed = Math.max(0, (time.end ?? serverNow) - time.start)
    return row
  })
}

export function deriveRows(s: RowInputs, tasks: Task[], now: number): RunRow[] {
  const { run } = s
  if (!run) return []
  const runStart = Date.parse(run.startedAt)
  const serverNow = now + s.skew
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cleared = new Set(run.cleared ?? [])
  return run.tasks.filter((rt) => !cleared.has(rt.taskId)).map((rt) => {
    const st = s.statuses[rt.taskId]
    const result = s.results[rt.taskId]
    const task = byId.get(rt.taskId)
    const time = s.timing[rt.taskId]
    const row: RunRow = { taskId: rt.taskId, title: displayTitle(task?.title, rt.title, rt.taskId), by: rt.by, state: 'queued', percent: 0 }
    if (st) {
      row.phase = st.phase
      row.message = st.message
      row.percent = st.percent
      row.updatedAt = Date.parse(st.updatedAt)
    }
    // the app already merged this run's result into the task
    // (agent.updatedAt is client time; runStart is server time)
    const merged = task?.agent && task.agent.updatedAt >= runStart - s.skew - 2000 ? task.agent.status : undefined
    if (result?.status === 'returned' || merged === 'returned') row.state = 'returned'
    else if (result && result.status !== 'working') row.state = 'done'
    else if (merged === 'review' || merged === 'approved' || (merged === 'queued' && task?.owner !== rt.by)) row.state = 'done'
    else if (task && task.status === 'done') row.state = 'done'
    else if (st && st.percent >= 100) row.state = 'done'
    // the bridge saw it finish (its result may already have been picked up and its status cleaned up)
    else if (time?.end && !st) row.state = 'done'
    else if (st) row.state = st.stale ? 'stalled' : 'working'
    else if (!task && run.state !== 'running') row.state = 'done'
    // a run that ended without this task getting a result
    if ((row.state === 'queued' || row.state === 'working') && run.state !== 'running') row.state = 'stalled'

    if (row.state === 'done' || row.state === 'returned') row.percent = 100
    const live = row.state === 'working' || row.state === 'stalled'
    if (time && (time.end || live)) row.elapsed = Math.max(0, (time.end ?? serverNow) - time.start)
    if (rt.by === 'manager' && s.teams[rt.taskId]) {
      row.hires = hireRows(s, rt.taskId, serverNow, row.state === 'done' || row.state === 'returned')
      row.rationale = s.teams[rt.taskId].rationale
      // while the team works the manager itself is waiting: say so
      if (row.state === 'working' && st && (st.ownPercent ?? st.percent) < 85 && row.hires.some((h) => h.state !== 'queued' && h.state !== 'done'))
        row.phase = 'Team at work'
    }
    return row
  })
}

export function runProgress(rows: RunRow[]) {
  const done = rows.filter((r) => r.state === 'done' || r.state === 'returned').length
  const percent = rows.length ? rows.reduce((a, r) => a + r.percent, 0) / rows.length : 0
  return { done, total: rows.length, percent }
}

/** The next scheduled run after `from`, using local time. */
export function nextScheduled(from: Date): Date {
  const slots = [...SCHEDULE].sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]))
  for (let day = 0; day < 2; day++) {
    for (const [h, m] of slots) {
      const d = new Date(from)
      d.setDate(d.getDate() + day)
      d.setHours(h, m, 0, 0)
      if (d > from) return d
    }
  }
  return from
}

export function formatElapsed(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
