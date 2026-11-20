import { addDays, addMonths, getDay } from 'date-fns'
import type { DateKey, Recurrence } from './types'
import { fromKey, toKey, todayKey } from './utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function describeRecurrence(r: Recurrence): string {
  switch (r.type) {
    case 'daily':
      return 'Every day'
    case 'weekdays':
      return 'Weekdays'
    case 'weekly':
      return r.weekday != null ? `Every ${WEEKDAYS[r.weekday]}` : 'Every week'
    case 'monthly':
      return 'Every month'
    case 'interval':
      return (r.interval ?? 1) === 1 ? 'Every day' : `Every ${r.interval} days`
  }
}

/** Next occurrence strictly after `from` (and never in the past). */
export function nextOccurrence(r: Recurrence, from: DateKey | null): DateKey {
  const today = fromKey(todayKey())
  let base = from ? fromKey(from) : today
  if (base < today) base = today
  let next: Date
  switch (r.type) {
    case 'daily':
      next = addDays(base, 1)
      break
    case 'weekdays': {
      next = addDays(base, 1)
      while (getDay(next) === 0 || getDay(next) === 6) next = addDays(next, 1)
      break
    }
    case 'weekly': {
      const target = r.weekday ?? getDay(base)
      next = addDays(base, 1)
      while (getDay(next) !== target) next = addDays(next, 1)
      break
    }
    case 'monthly':
      next = addMonths(base, 1)
      break
    case 'interval':
      next = addDays(base, Math.max(1, r.interval ?? 1))
      break
  }
  return toKey(next)
}

export const DEFAULT_INTERVAL = 3
export const MAX_INTERVAL = 365

/** Clamp a user-entered "every N days" value to a sane whole number. */
export function clampInterval(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(n)))
}

export const RECURRENCE_OPTIONS: { value: string; label: string; make: (due: DateKey | null) => Recurrence | null }[] = [
  { value: 'none', label: 'Does not repeat', make: () => null },
  { value: 'daily', label: 'Every day', make: () => ({ type: 'daily' }) },
  { value: 'weekdays', label: 'Every weekday', make: () => ({ type: 'weekdays' }) },
  {
    value: 'weekly',
    label: 'Every week',
    make: (due) => ({ type: 'weekly', weekday: getDay(due ? fromKey(due) : new Date()) }),
  },
  { value: 'monthly', label: 'Every month', make: () => ({ type: 'monthly' }) },
  { value: 'interval', label: 'Every N days', make: () => ({ type: 'interval', interval: DEFAULT_INTERVAL }) },
]
