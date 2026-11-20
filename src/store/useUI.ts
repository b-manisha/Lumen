import { create } from 'zustand'
import type { AgentStatus, Filters, ViewId } from '../lib/types'

/** What the wide report reader shows: one task report, or a run's summary. */
export type ReaderTarget = { kind: 'report'; taskId: string; reportId: string } | { kind: 'run'; startedAt: string; runId?: string }

export type Overlay = null | 'palette' | 'quickadd' | 'plan' | 'shutdown' | 'settings' | 'shortcuts'

interface UIState {
  view: ViewId
  overlay: Overlay
  editingId: string | null
  selectedId: string | null
  /** ids in the order currently rendered, for j/k navigation */
  visibleIds: string[]
  focusTaskId: string | null
  focusOpen: boolean
  mobileNav: boolean
  filters: Filters
  quickAddPrefill: string
  /** Delegation view's agent-status filter (lifted here so the status bar can deep-link to "review") */
  delegationStatus: 'all' | AgentStatus
  reader: ReaderTarget | null
  openReader: (r: ReaderTarget | null) => void
  setDelegationStatus: (s: 'all' | AgentStatus) => void
  setView: (v: ViewId) => void
  open: (o: Overlay, prefill?: string) => void
  close: () => void
  edit: (id: string | null) => void
  select: (id: string | null) => void
  setVisible: (ids: string[]) => void
  startFocus: (taskId: string | null) => void
  endFocus: () => void
  setMobileNav: (v: boolean) => void
  setFilters: (f: Partial<Filters>) => void
  resetFilters: () => void
}

export const EMPTY_FILTERS: Filters = { query: '', priorities: [], tags: [], energy: null }

export function viewToHash(v: ViewId): string {
  return v.kind === 'project' ? `#/project/${v.id}` : `#/${v.kind}`
}

export function hashToView(hash: string): ViewId {
  const [, kind, id] = hash.replace(/^#/, '').split('/')
  switch (kind) {
    case 'inbox':
    case 'today':
    case 'upcoming':
    case 'logbook':
    case 'matrix':
    case 'board':
    case 'delegation':
    case 'reports':
      return { kind }
    case 'project':
      return id ? { kind: 'project', id } : { kind: 'dashboard' }
    default:
      return { kind: 'dashboard' }
  }
}

export const useUI = create<UIState>()((set) => ({
  view: typeof window !== 'undefined' ? hashToView(window.location.hash) : { kind: 'dashboard' },
  overlay: null,
  editingId: null,
  selectedId: null,
  visibleIds: [],
  focusTaskId: null,
  focusOpen: false,
  mobileNav: false,
  filters: EMPTY_FILTERS,
  quickAddPrefill: '',
  delegationStatus: 'all',
  reader: null,
  openReader: (reader) => set({ reader }),
  setDelegationStatus: (delegationStatus) => set({ delegationStatus }),
  setView: (view) => {
    if (typeof window !== 'undefined') {
      const h = viewToHash(view)
      if (window.location.hash !== h) window.history.pushState(null, '', h)
    }
    set({ view, mobileNav: false, selectedId: null })
  },
  open: (overlay, prefill = '') => set({ overlay, quickAddPrefill: prefill, mobileNav: false }),
  close: () => set({ overlay: null }),
  edit: (editingId) => set({ editingId }),
  select: (selectedId) => set({ selectedId }),
  setVisible: (visibleIds) => set({ visibleIds }),
  startFocus: (focusTaskId) => set({ focusTaskId, focusOpen: true, overlay: null, mobileNav: false }),
  endFocus: () => set({ focusOpen: false }),
  setMobileNav: (mobileNav) => set({ mobileNav }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
}))
