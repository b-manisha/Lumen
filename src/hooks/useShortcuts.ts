import { useEffect } from 'react'
import type { Priority, ViewId } from '../lib/types'
import { isTypingTarget, todayKey } from '../lib/utils'
import { completeTask, deleteTask, undo } from '../lib/actions'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'

const GO: Record<string, ViewId> = {
  d: { kind: 'dashboard' },
  i: { kind: 'inbox' },
  t: { kind: 'today' },
  u: { kind: 'upcoming' },
  l: { kind: 'logbook' },
  m: { kind: 'matrix' },
  b: { kind: 'board' },
  a: { kind: 'delegation' },
  r: { kind: 'reports' },
}

/** Global keyboard layer: ⌘K, Q, G-chords, J/K selection, X/E/1-4/⌫, P, F, ⇧S, ⇧T, ⌘Z, ?, /. */
export function useShortcuts() {
  useEffect(() => {
    let gPending = 0

    const onKey = (e: KeyboardEvent) => {
      const ui = useUI.getState()
      const store = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      // ⌘K works everywhere (toggle)
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (ui.focusOpen) return
        if (ui.overlay === 'palette') ui.close()
        else ui.open('palette')
        return
      }
      if (ui.focusOpen) return // focus mode owns the keyboard
      if (isTypingTarget(e.target)) return
      if (ui.overlay || ui.editingId) {
        // Modals handle their own keys; allow ⌘Z
        if (!(mod && e.key.toLowerCase() === 'z')) return
      }

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod || e.altKey) return

      const k = e.key
      const lower = k.toLowerCase()

      // G-chords
      if (gPending && Date.now() - gPending < 1200) {
        gPending = 0
        const v = GO[lower]
        if (v) {
          e.preventDefault()
          ui.setView(v)
        }
        return
      }
      if (lower === 'g' && !e.shiftKey) {
        gPending = Date.now()
        return
      }

      const sel = ui.selectedId && store.tasks.some((t) => t.id === ui.selectedId) ? ui.selectedId : null

      switch (true) {
        case k === '?':
          e.preventDefault()
          ui.open('shortcuts')
          return
        case lower === 't' && e.shiftKey:
          e.preventDefault()
          store.toggleTheme()
          return
        case lower === 's' && e.shiftKey:
          e.preventDefault()
          ui.open('shutdown')
          return
        case (lower === 'q' || lower === 'n') && !e.shiftKey:
          e.preventDefault()
          ui.open('quickadd')
          return
        case k === '/': {
          const el = document.getElementById('filter-search') as HTMLInputElement | null
          e.preventDefault()
          if (el) el.focus()
          else ui.open('palette')
          return
        }
        case lower === 'p':
          e.preventDefault()
          ui.open('plan')
          return
        case lower === 'f':
          e.preventDefault()
          ui.startFocus(sel ?? ui.visibleIds[0] ?? null)
          return
        case lower === 'j' || k === 'ArrowDown' || lower === 'k' || k === 'ArrowUp': {
          const ids = ui.visibleIds
          if (!ids.length) return
          e.preventDefault()
          const dir = lower === 'j' || k === 'ArrowDown' ? 1 : -1
          const idx = sel ? ids.indexOf(sel) : -1
          const next = idx < 0 ? (dir > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, idx + dir))
          ui.select(ids[next])
          return
        }
        case k === 'Escape':
          if (sel) ui.select(null)
          return
      }

      if (!sel) return
      if (lower === 'x' || k === ' ') {
        e.preventDefault()
        const ids = ui.visibleIds
        const idx = ids.indexOf(sel)
        completeTask(sel)
        const next = ids[idx + 1] ?? ids[idx - 1] ?? null
        ui.select(next)
      } else if (lower === 'e' || k === 'Enter') {
        e.preventDefault()
        ui.edit(sel)
      } else if (k === 'Backspace' || k === 'Delete') {
        e.preventDefault()
        const ids = ui.visibleIds
        const idx = ids.indexOf(sel)
        deleteTask(sel)
        ui.select(ids[idx + 1] ?? ids[idx - 1] ?? null)
      } else if (['1', '2', '3', '4'].includes(k)) {
        e.preventDefault()
        store.updateTask(sel, { priority: Number(k) as Priority })
      } else if (lower === 't') {
        e.preventDefault()
        const t = store.tasks.find((x) => x.id === sel)
        const today = todayKey()
        if (t) store.updateTask(sel, { plannedFor: t.plannedFor === today ? null : today })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
