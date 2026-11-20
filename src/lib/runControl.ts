/**
 * Client for the in-app "Run agents" button (see plugins/runner.ts).
 *
 * Polls GET /api/piles/run/state (fast while a run is starting or active, slowly when idle, never while the
 * tab is hidden), starts and stops runs, and toasts the outcome. Every request carries `X-Lumen-Run: 1` and
 * the tab's bridge mode; a `?bridge=read` tab never shows the button and the server refuses it anyway.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { AgentRole } from './types'
import { BRIDGE_AVAILABLE, BRIDGE_READ_ONLY } from './bridge'
import { isRunActive, pollRunStatus, useRun } from './agentRun'

export interface RunnableTask {
  id: string
  title: string
  by: AgentRole
}

export interface LastExit {
  code: number | null
  signal: string | null
  at: string
  stoppedByUser: boolean
  log: string
  ok: boolean
}

export interface RunnerState {
  canRun: boolean
  reason?: 'running' | 'nothing' | 'no-queue' | 'cli-missing'
  message?: string
  selectable: RunnableTask[]
  /** a process started from Lumen is alive */
  active: boolean
  /** run.json says running (from any source) */
  runActive: boolean
  pid?: number
  startedAt?: string
  log?: string
  logTail: string[]
  lastExit?: LastExit
  cli: 'found' | 'missing' | 'stand-in'
  model: string
}

interface RunnerStore {
  state: RunnerState | null
  /** a start/stop request is in flight */
  busy: 'start' | 'stop' | null
  /** the log drawer is open */
  logOpen: boolean
  /** lines shown in the log drawer (polled while it's open) */
  logLines: string[]
  /** ⌘K "Run agents now" asks the Delegation view's button to open its confirm popover */
  confirmPending: boolean
}

export const useRunner = create<RunnerStore>()(() => ({ state: null, busy: null, logOpen: false, logLines: [], confirmPending: false }))

if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

/** The button exists only on the dev server, in a tab that writes the queue. */
export const RUN_BUTTON_AVAILABLE = BRIDGE_AVAILABLE && !BRIDGE_READ_ONLY

const HEADERS = { 'X-Lumen-Run': '1', 'X-Lumen-Mode': BRIDGE_READ_ONLY ? 'read' : 'write' }

async function call<T>(url: string, method: 'GET' | 'POST', body?: unknown): Promise<{ status: number; data: T & { ok?: boolean; error?: string; reason?: string } }> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? HEADERS : { ...HEADERS, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.headers.get('content-type')?.includes('application/json')) throw new Error(`Bridge ${res.status}`)
  return { status: res.status, data: await res.json() }
}

let inflight = false
/** restarts the polling loop (set by useRunnerPolling), so a start/stop switches to the fast cadence at once */
let kick: (() => void) | null = null
/** was a Lumen-started process alive at the previous poll (to toast its exit once) */
let wasActive = false

function openLog() {
  useRunner.setState({ logOpen: true })
}

function announceExit(exit: LastExit | undefined) {
  if (!exit || exit.ok) return
  if (exit.stoppedByUser) return // the Stop action already said so
  toast.error(exit.code == null ? 'The agent run ended unexpectedly' : `The agent run failed (exit code ${exit.code})`, {
    description: 'Finished results are kept. The log shows what happened.',
    action: { label: 'View log', onClick: openLog },
    duration: 12_000,
  })
}

export async function pollRunner(lines?: number): Promise<RunnerState | null> {
  if (!BRIDGE_AVAILABLE || inflight) return useRunner.getState().state
  inflight = true
  try {
    const want = lines ?? (useRunner.getState().logOpen ? 300 : 30)
    const { status, data } = await call<RunnerState>(`/api/piles/run/state?lines=${want}`, 'GET')
    if (status !== 200) throw new Error(data.error ?? `Bridge ${status}`)
    const prev = useRunner.getState().state
    if (wasActive && !data.active) {
      announceExit(data.lastExit)
      void pollRunStatus()
    }
    wasActive = data.active
    // the orchestrator just wrote run.json: switch the status bar to live progress now, not on its idle poll
    if (data.runActive !== isRunActive(useRun.getState().run)) void pollRunStatus()
    useRunner.setState({
      state: prev && JSON.stringify(prev) === JSON.stringify(data) ? prev : data,
      ...(want > 30 ? { logLines: data.logTail } : {}),
    })
    return data
  } catch {
    return null
  } finally {
    inflight = false
  }
}

/** Start the orchestrator for these tasks (all selectable ones when omitted). Returns true when it started. */
export async function startRun(taskIds?: string[]): Promise<boolean> {
  if (!RUN_BUTTON_AVAILABLE || useRunner.getState().busy) return false
  useRunner.setState({ busy: 'start' })
  try {
    const { status, data } = await call<{ tasks?: RunnableTask[]; log?: string }>('/api/piles/run', 'POST', { taskIds })
    if (status === 202 && data.ok) {
      const n = data.tasks?.length ?? 0
      wasActive = true
      toast.success('Agents are on it', {
        description: `${n} task${n === 1 ? '' : 's'} · watch progress in the status bar below`,
        duration: 5000,
      })
      return true
    }
    if (data.reason === 'cli-missing')
      toast.error('Claude Code CLI not found', {
        description: 'Install Claude Code, or put `claude` on PATH or at ~/.local/bin/claude. You can still ask Claude Code to “run the piles”.',
        duration: 12_000,
      })
    else if (data.reason === 'running') toast('Agents are already running', { description: data.error })
    else if (data.reason === 'nothing') toast('Nothing to run', { description: 'No queued Manager or Junior tasks. Delegate a task first.' })
    else if (data.reason === 'forbidden') toast.error('Run blocked', { description: data.error })
    else toast.error('Couldn’t start the agents', { description: data.error ?? `Bridge ${status}`, action: { label: 'View log', onClick: openLog } })
    return false
  } catch {
    toast.error('Couldn’t reach the dev server', { description: 'Is `npm run dev` running?' })
    return false
  } finally {
    useRunner.setState({ busy: null })
    if (kick) kick()
    else void pollRunner()
    void pollRunStatus()
  }
}

export async function stopRun(): Promise<void> {
  if (!RUN_BUTTON_AVAILABLE || useRunner.getState().busy) return
  useRunner.setState({ busy: 'stop' })
  try {
    const { status, data } = await call<unknown>('/api/piles/run/stop', 'POST', {})
    if (status === 200) toast('Agent run stopped', { description: 'Results already written are kept.', action: { label: 'View log', onClick: openLog } })
    else toast.error('Couldn’t stop the run', { description: data.error })
  } catch {
    toast.error('Couldn’t reach the dev server')
  } finally {
    wasActive = false
    useRunner.setState({ busy: null })
    if (kick) kick()
    else void pollRunner()
    void pollRunStatus()
  }
}

/** ⌘K "Run agents now": show the Delegation view's confirm popover. */
export function requestRunConfirm() {
  useRunner.setState({ confirmPending: true })
}

/** Is a run in progress, from Lumen or anywhere else (Claude Code chat, the schedule)? */
export function useAnyRunActive(): boolean {
  const runActive = useRun((s) => isRunActive(s.run))
  const procActive = useRunner((s) => !!s.state?.active)
  return runActive || procActive
}

/** Mount once (App): polls the runner state. */
export function useRunnerPolling() {
  const logOpen = useRunner((s) => s.logOpen)
  useEffect(() => {
    if (!BRIDGE_AVAILABLE) return
    let timer: number | undefined
    let alive = true
    const fast = () => {
      const st = useRunner.getState()
      return st.logOpen || !!st.state?.active || isRunActive(useRun.getState().run)
    }
    const schedule = () => {
      window.clearTimeout(timer)
      if (!alive || document.visibilityState !== 'visible') return
      timer = window.setTimeout(tick, fast() ? 2500 : 10_000)
    }
    const tick = () => void pollRunner().finally(schedule)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
      else window.clearTimeout(timer)
    }
    tick()
    kick = tick
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      if (kick === tick) kick = null
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [logOpen])
}
