import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import { useStore, exportData } from '../store/useStore'
import { useUI } from '../store/useUI'
import { prefersReducedMotion, todayKey } from './utils'

export function celebrate() {
  if (prefersReducedMotion() || !useStore.getState().settings.confetti) return
  const colors = ['#7C7FFF', '#9496FF', '#3DD68C', '#F5B748', '#52A9FF', '#EDEDEF']
  const base = {
    particleCount: 70,
    spread: 70,
    startVelocity: 42,
    ticks: 220,
    gravity: 0.9,
    scalar: 0.9,
    colors,
    disableForReducedMotion: true,
  }
  confetti({ ...base, origin: { x: 0.25, y: 0.7 }, angle: 60 })
  confetti({ ...base, origin: { x: 0.75, y: 0.7 }, angle: 120 })
  setTimeout(() => confetti({ ...base, particleCount: 50, spread: 110, origin: { x: 0.5, y: 0.55 } }), 180)
}

function undoAction() {
  if (useStore.getState().undo()) toast('Restored', { duration: 1800 })
}

export function completeTask(id: string) {
  const t = useStore.getState().tasks.find((x) => x.id === id)
  if (!t) return
  const { completed, clearedToday } = useStore.getState().toggleComplete(id)
  if (completed) {
    if (clearedToday) {
      celebrate()
      toast.success('Today is clear', {
        description: 'Every task on today’s list is done. Take the win.',
        action: { label: 'Undo', onClick: undoAction },
        duration: 6000,
      })
    } else {
      toast(`Completed “${truncate(t.title)}”`, {
        description: t.recurrence ? 'Next occurrence scheduled.' : undefined,
        action: { label: 'Undo', onClick: undoAction },
      })
    }
  } else {
    toast(`Reopened “${truncate(t.title)}”`, { action: { label: 'Undo', onClick: undoAction } })
  }
}

export function deleteTask(id: string) {
  const t = useStore.getState().deleteTask(id)
  if (!t) return
  const ui = useUI.getState()
  if (ui.editingId === id) ui.edit(null)
  toast(`Deleted “${truncate(t.title)}”`, { action: { label: 'Undo', onClick: undoAction } })
}

export function undo() {
  if (useStore.getState().undo()) toast('Undone', { duration: 1600 })
  else toast('Nothing to undo', { duration: 1400 })
}

export function downloadExport() {
  const blob = new Blob([exportData()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lumen-backup-${todayKey()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success('Backup exported')
}

export function pickImport() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const res = useStore.getState().importData(text)
    if (res.ok) toast.success(`Imported ${res.count} tasks`, { action: { label: 'Undo', onClick: undoAction } })
    else toast.error('Import failed', { description: res.error })
  }
  input.click()
}

function truncate(s: string, n = 36) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
