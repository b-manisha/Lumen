import { useEffect, useMemo, useState } from 'react'
import type { DateKey, DayActivity, Filters, Task } from '../lib/types'
import { dayOf } from '../lib/stats'
import { compareTasks, isToday, todayKey } from '../lib/utils'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'

/** Re-renders every minute so date-relative UI ("today", greetings) stays fresh. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function useDayGetter(): (k: DateKey) => DayActivity {
  const activity = useStore((s) => s.activity)
  const demo = useStore((s) => s.demoActivity)
  return useMemo(() => (k: DateKey) => dayOf(activity, demo, k), [activity, demo])
}

export function useTodayTasks() {
  const tasks = useStore((s) => s.tasks)
  return useMemo(() => {
    const today = todayKey()
    const open = tasks.filter((t) => isToday(t, today)).sort(compareTasks)
    const doneToday = tasks.filter((t) => t.status === 'done' && !!t.completedAt && localDay(t.completedAt) === today)
    return { open, doneToday }
  }, [tasks])
}

export function localDay(iso: string): DateKey {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function applyFilters(tasks: Task[], f: Filters): Task[] {
  const q = f.query.trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false
    if (f.tags.length && !f.tags.some((tag) => t.tags.includes(tag))) return false
    if (f.energy && t.energy && t.energy !== f.energy) return false
    if (q) {
      const hay = `${t.title} ${t.notes} ${t.tags.map((x) => '#' + x).join(' ')} ${t.subtasks.map((s) => s.title).join(' ')}`.toLowerCase()
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false
    }
    return true
  })
}

export function useFilters() {
  return useUI((s) => s.filters)
}

export function useAllTags(): string[] {
  const tasks = useStore((s) => s.tasks)
  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of tasks) for (const tag of t.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [tasks])
}
