/**
 * Client side of the Lumen ⇄ Claude Code bridge (see plugins/piles.ts).
 *
 * - Syncs the open tasks to `piles/` (debounced) whenever tasks or projects change.
 * - Polls `piles/results/*.json` every 5s while the tab is visible, merges results into tasks,
 *   toasts new deliverables and acknowledges the files.
 * - In a production build there is no bridge: status is `offline` and the Delegation view offers
 *   export buttons instead.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { toast } from 'sonner'
import type { AgentResult } from './types'
import { allPileFiles, buildQueue } from './piles'
import { OWNER_LABEL } from './delegate'
import { STORAGE_KEY, useStore } from '../store/useStore'
import { useUI } from '../store/useUI'

export type BridgeStatus = 'checking' | 'connected' | 'offline'

interface BridgeState {
  status: BridgeStatus
  lastSync: number | null
  lastPoll: number | null
}

export const useBridge = create<BridgeState>()(() => ({
  status: import.meta.env.DEV ? 'checking' : 'offline',
  lastSync: null,
  lastPoll: null,
}))

// The bridge owns module-level state (timers, last sync). Hot-swapping it would leave two copies
// running, so any change that reaches this module triggers a full reload instead.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

/** The bridge only exists under `vite` (dev). */
export const BRIDGE_AVAILABLE = import.meta.env.DEV

const SYNC_DEBOUNCE = 800
const POLL_MS = 5000

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  // a static host answers unknown routes with index.html; only a JSON { ok: true } counts
  if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) throw new Error(`Bridge ${res.status}`)
  const data = (await res.json()) as T & { ok?: boolean }
  if (!data.ok) throw new Error('Bridge error')
  return data
}

function setStatus(status: BridgeStatus) {
  if (useBridge.getState().status !== status) useBridge.setState({ status })
}

function currentFiles() {
  const { tasks, projects } = useStore.getState()
  return allPileFiles(buildQueue(tasks, projects))
}

let lastSent = ''

/**
 * Several browser profiles can talk to the same dev server. A profile that had no Lumen data when this
 * page loaded (a fresh browser, a private window) is "uninitialised": it never writes the queue, so it
 * can't replace another profile's piles with its empty or demo store. It becomes initialised as soon as
 * the user changes a task here.
 */
const HAD_DATA_AT_BOOT = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) != null
  } catch {
    return false
  }
})()
let touched = false
function storeInitialized() {
  return useStore.persist.hasHydrated() && (HAD_DATA_AT_BOOT || touched)
}

/**
 * `?bridge=read` in the URL: this tab follows runs and picks up its own results but never writes the
 * queue. Use it for a second browser profile or a demo screen that shouldn't replace your real piles.
 */
const READ_ONLY = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bridge') === 'read'

/** Push the open tasks to piles/. Skips the request when nothing changed since the last sync. */
export async function syncPiles(force = false): Promise<boolean> {
  if (!BRIDGE_AVAILABLE) return false
  if (READ_ONLY || !storeInitialized()) return false
  const { tasks, projects } = useStore.getState()
  const queue = buildQueue(tasks, projects)
  const signature = JSON.stringify(queue.tasks)
  if (!force && signature === lastSent) return true
  const files = allPileFiles(queue)
  try {
    await api('/api/piles', {
      queue,
      markdown: { human: files['human.md'], manager: files['manager.md'], junior: files['junior.md'] },
      initialized: true,
    })
    lastSent = signature
    useBridge.setState({ lastSync: Date.now() })
    setStatus('connected')
    return true
  } catch {
    setStatus('offline')
    return false
  }
}

function truncate(s: string, n = 42) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function announce(summary: ReturnType<ReturnType<typeof useStore.getState>['applyAgentResults']>) {
  const tasks = useStore.getState().tasks
  const title = (id: string) => truncate(tasks.find((t) => t.id === id)?.title ?? 'Task')
  const { edit, setView } = useUI.getState()

  if (summary.review.length > 2) {
    toast.success(`${summary.review.length} agent outputs ready for review`, {
      action: { label: 'Review', onClick: () => setView({ kind: 'delegation' }) },
      duration: 8000,
    })
  } else {
    for (const id of summary.review) {
      const by = tasks.find((t) => t.id === id)?.agent?.by
      toast.success(`${by ? OWNER_LABEL[by] : 'Agent'} finished “${title(id)}”`, {
        description: 'Ready for your review',
        action: { label: 'Review', onClick: () => edit(id) },
        duration: 8000,
      })
    }
  }
  for (const id of summary.returned) {
    const t = tasks.find((x) => x.id === id)
    toast(`Returned to you: “${title(id)}”`, {
      description: t?.agent?.note ? truncate(t.agent.note, 110) : 'An agent can’t do this one.',
      action: { label: 'Open', onClick: () => edit(id) },
      duration: 8000,
    })
  }
  for (const id of summary.handed) {
    toast(`“${title(id)}” handed to the Junior agent`, { description: 'The manager planned it; drafting is queued.' })
  }
}

let polling = false

/** Fetch new agent results, merge them into tasks and move the files to results/processed/. */
export async function pollResults(): Promise<void> {
  if (!BRIDGE_AVAILABLE || polling) return
  polling = true
  try {
    const wasOffline = useBridge.getState().status !== 'connected'
    const data = await api<{ results: AgentResult[] }>('/api/piles/results')
    useBridge.setState({ lastPoll: Date.now() })
    setStatus('connected')
    if (wasOffline) void syncPiles(true)
    // only take results for tasks this browser's store has: another profile's results stay on disk for it
    const ids = new Set(useStore.getState().tasks.map((t) => t.id))
    const mine = data.results.filter((r) => ids.has(r.taskId))
    if (!mine.length) return
    const summary = useStore.getState().applyAgentResults(mine)
    announce(summary)
    await api('/api/piles/results/ack', { files: mine.map((r) => r.file).filter(Boolean) })
  } catch {
    setStatus('offline')
  } finally {
    polling = false
  }
}

/** Mount once (App). Debounced sync on task changes + visible-tab polling. */
export function useAgentBridge() {
  useEffect(() => {
    if (!BRIDGE_AVAILABLE) return
    let timer: number | undefined
    void syncPiles(true)
    void pollResults()

    const unsub = useStore.subscribe((s, prev) => {
      if (s.tasks === prev.tasks && s.projects === prev.projects) return
      if (useStore.persist.hasHydrated()) touched = true
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void syncPiles(), SYNC_DEBOUNCE)
    })
    const tick = () => {
      if (document.visibilityState === 'visible') void pollResults()
    }
    const iv = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      unsub()
      window.clearTimeout(timer)
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
}

/** Production fallback: download the pile files the bridge would have written. */
export function downloadPileFile(name: keyof ReturnType<typeof currentFiles>) {
  const content = currentFiles()[name]
  const blob = new Blob([content], { type: name.endsWith('.json') ? 'application/json' : 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name === 'queue.json' ? 'lumen-piles-queue.json' : `lumen-piles-${name}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadAllPiles() {
  const names = ['queue.json', 'human.md', 'manager.md', 'junior.md'] as const
  names.forEach((n, i) => setTimeout(() => downloadPileFile(n), i * 180))
  toast.success('Exported the piles', { description: 'queue.json plus human, manager and junior checklists.' })
}
