import * as chrono from 'chrono-node'
import { addDays, getDay } from 'date-fns'
import type { DateKey, Energy, Priority, Project, Recurrence } from './types'
import { describeRecurrence } from './recurrence'
import { dueLabel, formatTime, PRIORITY_META, toKey } from './utils'

export type TokenKind = 'date' | 'tag' | 'priority' | 'energy' | 'estimate' | 'project' | 'recurrence'

export interface ParsedToken {
  kind: TokenKind
  label: string
  start: number
  end: number
}

export interface ParsedInput {
  title: string
  due: DateKey | null
  dueTime: string | null
  priority: Priority | null
  tags: string[]
  energy: Energy | null
  estimate: number | null
  projectId: string | null
  /** set when `@name` doesn't match an existing project */
  newProjectName: string | null
  recurrence: Recurrence | null
  tokens: ParsedToken[]
}

const PRIORITY_WORDS: Record<string, Priority> = {
  urgent: 1,
  high: 1,
  hi: 1,
  p1: 1,
  '1': 1,
  med: 2,
  medium: 2,
  p2: 2,
  '2': 2,
  low: 3,
  p3: 3,
  '3': 3,
  none: 4,
  p4: 4,
  '4': 4,
}

const DAY_WORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

function nextWeekday(target: number): Date {
  let d = new Date()
  while (getDay(d) !== target) d = addDays(d, 1)
  return d
}

export function parseQuickAdd(input: string, projects: Project[]): ParsedInput {
  const out: ParsedInput = {
    title: '',
    due: null,
    dueTime: null,
    priority: null,
    tags: [],
    energy: null,
    estimate: null,
    projectId: null,
    newProjectName: null,
    recurrence: null,
    tokens: [],
  }
  // Masked copy: matched token spans are replaced with spaces so indices stay stable.
  let masked = input
  const mask = (start: number, end: number) => {
    masked = masked.slice(0, start) + ' '.repeat(end - start) + masked.slice(end)
  }
  const run = (re: RegExp, fn: (m: RegExpExecArray, start: number, end: number) => boolean) => {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    const source = masked
    while ((m = re.exec(source))) {
      const lead = m[1]?.length ?? 0
      const start = m.index + lead
      const end = m.index + m[0].length
      if (fn(m, start, end)) mask(start, end)
    }
  }

  // Recurrence: "every day", "every weekday", "every mon", "every 3 days", "daily", "weekly", "monthly"
  run(
    /(^|\s)(every\s+(day|weekday|weekdays|week|month|\d+\s+days?|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)|daily|weekly|monthly|weekdays)\b/gi,
    (m, start, end) => {
      if (out.recurrence) return false
      const word = (m[3] ?? m[2]).toLowerCase()
      let r: Recurrence | null = null
      if (word === 'day' || word === 'daily') r = { type: 'daily' }
      else if (word === 'weekday' || word === 'weekdays') r = { type: 'weekdays' }
      else if (word === 'week' || word === 'weekly') r = { type: 'weekly', weekday: getDay(new Date()) }
      else if (word === 'month' || word === 'monthly') r = { type: 'monthly' }
      else if (/^\d+/.test(word)) r = { type: 'interval', interval: parseInt(word, 10) }
      else if (word in DAY_WORDS) r = { type: 'weekly', weekday: DAY_WORDS[word] }
      if (!r) return false
      out.recurrence = r
      out.tokens.push({ kind: 'recurrence', label: describeRecurrence(r), start, end })
      return true
    },
  )

  // Tags: #family
  run(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (m, start, end) => {
    const tag = m[2].toLowerCase()
    if (!out.tags.includes(tag)) out.tags.push(tag)
    out.tokens.push({ kind: 'tag', label: tag, start, end })
    return true
  })

  // Priority: !high !p1 !1 !urgent !low
  run(/(^|\s)!(urgent|high|hi|medium|med|low|none|p[1-4]|[1-4])(?=\s|$)/gi, (m, start, end) => {
    const p = PRIORITY_WORDS[m[2].toLowerCase()]
    if (!p) return false
    out.priority = p
    out.tokens.push({ kind: 'priority', label: `${PRIORITY_META[p].short} · ${PRIORITY_META[p].label}`, start, end })
    return true
  })

  // Estimate: ~30m ~1h ~90min
  run(/(^|\s)~(\d+(?:\.\d+)?)\s?(m|min|mins|h|hr|hrs)(?=\s|$)/gi, (m, start, end) => {
    const n = parseFloat(m[2])
    const minutes = /^h/i.test(m[3]) ? Math.round(n * 60) : Math.round(n)
    out.estimate = minutes
    out.tokens.push({ kind: 'estimate', label: minutes >= 60 ? `${+(minutes / 60).toFixed(1)}h` : `${minutes}m`, start, end })
    return true
  })

  // Energy: ~low-energy ~high ~low
  run(/(^|\s)~(high|low)(?:-?energy)?(?=\s|$)/gi, (m, start, end) => {
    const e = m[2].toLowerCase() as Energy
    out.energy = e
    out.tokens.push({ kind: 'energy', label: e === 'high' ? 'High energy' : 'Low energy', start, end })
    return true
  })

  // Project: @launch
  run(/(^|\s)@([\p{L}\p{N}_-]+)/gu, (m, start, end) => {
    const q = m[2].toLowerCase().replace(/[-_]/g, ' ')
    const match =
      projects.find((p) => p.name.toLowerCase() === q) ??
      projects.find((p) => p.name.toLowerCase().startsWith(q)) ??
      projects.find((p) => p.name.toLowerCase().includes(q))
    if (match) {
      out.projectId = match.id
      out.tokens.push({ kind: 'project', label: match.name, start, end })
    } else {
      const name = m[2].replace(/[-_]/g, ' ')
      out.newProjectName = name.charAt(0).toUpperCase() + name.slice(1)
      out.tokens.push({ kind: 'project', label: `${out.newProjectName} (new)`, start, end })
    }
    return true
  })

  // Dates & times via chrono on the masked text
  const results = chrono.parse(masked, new Date(), { forwardDate: true })
  const res = results[0]
  if (res) {
    const d = res.start.date()
    out.due = toKey(d)
    if (res.start.isCertain('hour')) {
      out.dueTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    out.tokens.push({
      kind: 'date',
      label: out.dueTime ? `${dueLabel(out.due)} · ${formatTime(out.dueTime)}` : dueLabel(out.due),
      start: res.index,
      end: res.index + res.text.length,
    })
    mask(res.index, res.index + res.text.length)
  }

  // Recurring with no explicit date → first occurrence
  if (out.recurrence && !out.due) {
    const r = out.recurrence
    if (r.type === 'weekly' && r.weekday != null) out.due = toKey(nextWeekday(r.weekday))
    else if (r.type === 'weekdays') {
      let d = new Date()
      while (getDay(d) === 0 || getDay(d) === 6) d = addDays(d, 1)
      out.due = toKey(d)
    } else out.due = toKey(new Date())
  }

  out.title = masked.replace(/\s+/g, ' ').trim()
  out.tokens.sort((a, b) => a.start - b.start)
  return out
}
