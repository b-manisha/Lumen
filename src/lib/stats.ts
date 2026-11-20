import { format, subDays } from 'date-fns'
import type { DateKey, DayActivity, Project, Task } from './types'
import { addDaysKey, fromKey, isToday, todayKey, toKey } from './utils'

export type ActivityMap = Record<DateKey, DayActivity>

const EMPTY: DayActivity = { done: 0, planned: 0, focus: 0 }

export function dayOf(a: ActivityMap, b: ActivityMap, k: DateKey): DayActivity {
  const x = a[k] ?? EMPTY
  const y = b[k] ?? EMPTY
  return { done: x.done + y.done, planned: x.planned + y.planned, focus: x.focus + y.focus }
}

export function computeStreak(get: (k: DateKey) => DayActivity): { current: number; best: number; todayDone: boolean } {
  const today = todayKey()
  const todayDone = get(today).done > 0
  // current: count back from today (or yesterday if today has nothing yet)
  let cursor = todayDone ? today : addDaysKey(today, -1)
  let current = 0
  while (get(cursor).done > 0 && current < 3650) {
    current++
    cursor = addDaysKey(cursor, -1)
  }
  // best: scan last 2 years
  let best = 0
  let run = 0
  for (let i = 730; i >= 0; i--) {
    const k = toKey(subDays(new Date(), i))
    if (get(k).done > 0) {
      run++
      best = Math.max(best, run)
    } else run = 0
  }
  return { current, best: Math.max(best, current), todayDone }
}

export interface HeatCell {
  key: DateKey
  count: number
  focus: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** 53 columns × 7 rows ending this week (Sunday-first). */
export function heatmapGrid(get: (k: DateKey) => DayActivity): { weeks: HeatCell[][]; total: number; activeDays: number; max: number } {
  const today = fromKey(todayKey())
  const end = new Date(today)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end)
  start.setDate(start.getDate() - 53 * 7 + 1)
  const cells: HeatCell[] = []
  let max = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = toKey(d)
    const a = get(key)
    max = Math.max(max, a.done)
    cells.push({ key, count: a.done, focus: a.focus, level: 0, future: d > today })
  }
  // Quantile-ish thresholds so the ramp reads well for any volume
  const t = [1, Math.max(2, Math.ceil(max * 0.3)), Math.max(3, Math.ceil(max * 0.55)), Math.max(4, Math.ceil(max * 0.8))]
  let total = 0
  let activeDays = 0
  for (const c of cells) {
    total += c.count
    if (c.count > 0) activeDays++
    c.level = c.count >= t[3] ? 4 : c.count >= t[2] ? 3 : c.count >= t[1] ? 2 : c.count >= t[0] ? 1 : 0
  }
  const weeks: HeatCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return { weeks, total, activeDays, max }
}

export interface WeekBar {
  key: DateKey
  label: string
  completed: number
  planned: number
  isToday: boolean
}

export function weeklyBars(get: (k: DateKey) => DayActivity, tasks: Task[]): WeekBar[] {
  const today = todayKey()
  const openToday = tasks.filter((t) => isToday(t, today)).length
  const out: WeekBar[] = []
  for (let i = 6; i >= 0; i--) {
    const k = addDaysKey(today, -i)
    const a = get(k)
    // today is live (done + still open); past days use what was planned that morning
    const planned = k === today ? a.done + openToday : Math.max(a.planned, a.done)
    out.push({ key: k, label: format(fromKey(k), 'EEE'), completed: a.done, planned, isToday: k === today })
  }
  return out
}

export function focusSeries(get: (k: DateKey) => DayActivity, days = 14): number[] {
  const today = todayKey()
  return Array.from({ length: days }, (_, i) => get(addDaysKey(today, i - days + 1)).focus)
}

export interface BreakdownRow {
  id: string
  label: string
  color: string
  done: number
  open: number
}

export function projectBreakdown(tasks: Task[], projects: Project[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const p of projects) rows.set(p.id, { id: p.id, label: p.name, color: p.color, done: 0, open: 0 })
  rows.set('__inbox', { id: '__inbox', label: 'Inbox', color: 'var(--text-faint)', done: 0, open: 0 })
  for (const t of tasks) {
    const r = rows.get(t.projectId ?? '__inbox') ?? rows.get('__inbox')!
    if (t.status === 'done') r.done++
    else r.open++
  }
  return [...rows.values()].filter((r) => r.done + r.open > 0).sort((a, b) => b.done + b.open - (a.done + a.open))
}

const TAG_COLORS = ['#7C7FFF', '#3DD68C', '#F5B748', '#52A9FF', '#FF6369', '#E879F9', '#2DD4BF', '#FB923C']

export function tagBreakdown(tasks: Task[]): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>()
  for (const t of tasks) {
    for (const tag of t.tags) {
      if (!rows.has(tag)) rows.set(tag, { id: tag, label: `#${tag}`, color: '', done: 0, open: 0 })
      const r = rows.get(tag)!
      if (t.status === 'done') r.done++
      else r.open++
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.done + b.open - (a.done + a.open))
    .slice(0, 7)
    .map((r, i) => ({ ...r, color: TAG_COLORS[i % TAG_COLORS.length] }))
}
