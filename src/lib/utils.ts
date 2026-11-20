import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { addDays, differenceInCalendarDays, format, isValid, parseISO, startOfDay } from 'date-fns'
import type { DateKey, Priority, Task } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const toKey = (d: Date): DateKey => format(d, 'yyyy-MM-dd')
export const todayKey = (): DateKey => toKey(new Date())
export const fromKey = (k: DateKey): Date => startOfDay(parseISO(k))
export const addDaysKey = (k: DateKey, n: number): DateKey => toKey(addDays(fromKey(k), n))
export const daysFromToday = (k: DateKey): number => differenceInCalendarDays(fromKey(k), startOfDay(new Date()))

export function isValidKey(k: unknown): k is DateKey {
  return typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && isValid(parseISO(k))
}

/** Human, compact due label: "Today", "Tomorrow", "Fri", "12 Dec", "3d overdue" */
export function dueLabel(k: DateKey): string {
  const d = daysFromToday(k)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d < -1) return `${-d}d overdue`
  if (d < 7) return format(fromKey(k), 'EEE')
  const date = fromKey(k)
  return date.getFullYear() === new Date().getFullYear() ? format(date, 'd MMM') : format(date, 'd MMM yyyy')
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export const isOpen = (t: Task) => t.status !== 'done'
export const isOverdue = (t: Task) => isOpen(t) && !!t.due && daysFromToday(t.due) < 0

/** On the Today list: overdue, due today, or explicitly planned for today. */
export function isToday(t: Task, today = todayKey()): boolean {
  if (!isOpen(t)) return false
  if (t.plannedFor === today) return true
  return !!t.due && t.due <= today
}

export const PRIORITY_META: Record<Priority, { label: string; short: string; color: string }> = {
  1: { label: 'High', short: 'P1', color: 'var(--p1)' },
  2: { label: 'Medium', short: 'P2', color: 'var(--p2)' },
  3: { label: 'Low', short: 'P3', color: 'var(--p3)' },
  4: { label: 'None', short: 'P4', color: 'var(--p4)' },
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/** Sort: overdue first, then due date, then priority, then manual order. */
export function compareTasks(a: Task, b: Task): number {
  const ad = a.due ?? '9999-12-31'
  const bd = b.due ?? '9999-12-31'
  if (ad !== bd) return ad < bd ? -1 : 1
  if (a.priority !== b.priority) return a.priority - b.priority
  if ((a.dueTime ?? '') !== (b.dueTime ?? '')) return (a.dueTime ?? '99') < (b.dueTime ?? '99') ? -1 : 1
  return a.order - b.order
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Deterministic PRNG for seed data. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const modKey = isMac ? '⌘' : 'Ctrl'

export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export const PROJECT_COLORS = ['#7C7FFF', '#3DD68C', '#F5B748', '#52A9FF', '#FF6369', '#E879F9', '#2DD4BF', '#FB923C']
