import { nanoid } from 'nanoid'
import { getDay, subDays } from 'date-fns'
import type { DateKey, DayActivity, Priority, Project, Recurrence, Task } from './types'
import { addDaysKey, mulberry32, todayKey, toKey } from './utils'
import { nextOccurrence } from './recurrence'
import { autoOwnerFields } from './delegate'

interface SeedTask {
  title: string
  p?: string
  due?: number
  time?: string
  pri?: Priority
  tags?: string[]
  energy?: 'high' | 'low'
  est?: number
  notes?: string
  subs?: [string, boolean][]
  rec?: Recurrence
  status?: 'todo' | 'doing' | 'done'
  doneAgo?: number
  plan?: boolean
}

const PROJECTS: { key: string; name: string; color: string }[] = [
  { key: 'launch', name: 'Product Launch', color: '#7C7FFF' },
  { key: 'personal', name: 'Personal', color: '#3DD68C' },
  { key: 'health', name: 'Health', color: '#F5B748' },
  { key: 'home', name: 'Home', color: '#52A9FF' },
]

const TASKS: SeedTask[] = [
  // ── Product Launch
  {
    title: 'Finalize pricing page copy',
    p: 'launch',
    due: -2,
    pri: 1,
    tags: ['writing', 'web'],
    energy: 'high',
    est: 60,
    notes: 'Align tiers with the finance model. Remove "unlimited" wording from the Pro tier.',
    status: 'doing',
  },
  {
    title: 'Review onboarding flow with design',
    p: 'launch',
    due: 0,
    time: '11:00',
    pri: 1,
    tags: ['meeting', 'design'],
    energy: 'high',
    est: 45,
    subs: [
      ['Walk through empty states', true],
      ['Check copy on step 3', false],
      ['Agree on progress indicator', false],
    ],
  },
  { title: 'Write launch announcement draft', p: 'launch', due: 0, pri: 2, tags: ['writing'], energy: 'high', est: 90, plan: true },
  {
    title: 'QA checkout on Safari + iOS',
    p: 'launch',
    due: 1,
    pri: 1,
    tags: ['qa', 'web'],
    energy: 'low',
    est: 40,
    subs: [
      ['Apple Pay sheet', false],
      ['Coupon field', false],
      ['Receipt email', false],
    ],
  },
  { title: 'Prepare investor update slides', p: 'launch', due: 3, pri: 2, tags: ['finance'], energy: 'high', est: 120, status: 'doing' },
  { title: 'Set up status page', p: 'launch', due: 5, pri: 3, tags: ['infra'], energy: 'low', est: 30 },
  { title: 'Record product demo video', p: 'launch', due: 6, pri: 2, tags: ['video', 'marketing'], energy: 'high', est: 75 },
  { title: 'Sync with support on FAQ', p: 'launch', due: 2, time: '15:30', pri: 3, tags: ['meeting'], energy: 'low', est: 30 },
  {
    title: 'Weekly metrics review',
    p: 'launch',
    due: 4,
    pri: 2,
    tags: ['finance'],
    energy: 'low',
    est: 30,
    rec: { type: 'weekly', weekday: 1 },
  },
  { title: 'Ship changelog for v2.4', p: 'launch', status: 'done', doneAgo: 0, pri: 2, tags: ['writing'], energy: 'low' },
  { title: 'Fix flaky e2e auth test', p: 'launch', status: 'done', doneAgo: 1, pri: 1, tags: ['qa'] },
  { title: 'Draft press kit', p: 'launch', pri: 3, tags: ['marketing', 'writing'], energy: 'high', est: 60 },

  // ── Personal
  { title: 'Call mom', p: 'personal', due: 0, time: '17:00', pri: 1, tags: ['family'], energy: 'low', est: 20 },
  {
    title: 'Book flights for December trip',
    p: 'personal',
    due: -1,
    pri: 1,
    tags: ['travel'],
    energy: 'low',
    est: 25,
    notes: 'Window seat. Check the 9:40am direct first.',
  },
  { title: 'Read 20 pages', p: 'personal', due: 0, pri: 3, tags: ['reading'], energy: 'low', est: 30, rec: { type: 'daily' } },
  {
    title: 'Renew passport',
    p: 'personal',
    due: 9,
    pri: 2,
    tags: ['admin'],
    energy: 'low',
    est: 45,
    subs: [
      ['Take photo', true],
      ['Fill form', false],
      ['Book appointment', false],
    ],
  },
  { title: 'Plan Sam’s birthday dinner', p: 'personal', due: 4, pri: 2, tags: ['family'], energy: 'high', est: 40 },
  { title: 'Journal: monthly reflection', p: 'personal', due: 11, pri: 3, tags: ['reflection'], energy: 'low', rec: { type: 'monthly' } },
  { title: 'Return library books', p: 'personal', status: 'done', doneAgo: 0, pri: 4, tags: ['errand'] },

  // ── Health
  {
    title: 'Morning run, 5k',
    p: 'health',
    due: 0,
    time: '07:00',
    pri: 2,
    tags: ['fitness'],
    energy: 'high',
    est: 35,
    rec: { type: 'weekdays' },
    status: 'done',
    doneAgo: 0,
  },
  { title: 'Schedule dentist appointment', p: 'health', pri: 3, tags: ['admin'], energy: 'low', est: 10 },
  { title: 'Meal prep for the week', p: 'health', due: 3, pri: 3, tags: ['food'], energy: 'high', est: 90 },
  { title: 'Yoga class', p: 'health', due: 1, time: '18:30', pri: 3, tags: ['fitness'], energy: 'low', est: 60 },
  { title: 'Refill vitamins', p: 'health', due: 2, pri: 4, tags: ['errand'], energy: 'low', est: 10 },
  { title: 'Strength session', p: 'health', status: 'done', doneAgo: 2, pri: 3, tags: ['fitness'] },

  // ── Home
  { title: 'Pay electricity bill', p: 'home', due: 0, pri: 1, tags: ['finance', 'admin'], energy: 'low', est: 5 },
  { title: 'Fix squeaky bedroom door', p: 'home', due: 6, pri: 4, tags: ['diy'], energy: 'low', est: 15 },
  {
    title: 'Water the plants',
    p: 'home',
    due: 1,
    pri: 3,
    tags: ['chores'],
    energy: 'low',
    est: 10,
    rec: { type: 'interval', interval: 3 },
  },
  { title: 'Declutter hallway closet', p: 'home', pri: 4, tags: ['chores'], energy: 'high', est: 60 },
  { title: 'Order new desk lamp', p: 'home', status: 'done', doneAgo: 1, pri: 4, tags: ['errand'] },

  // ── Inbox (no project)
  { title: 'Look into standing desk options', pri: 4, tags: ['research'], energy: 'low' },
  { title: 'Reply to Alex about the conference talk', due: 1, pri: 2, tags: ['email'], energy: 'low', est: 15 },
  { title: 'Try the new ramen place on 5th', pri: 4, tags: ['fun'] },
]

export interface SeedResult {
  tasks: Task[]
  projects: Project[]
  demoActivity: Record<DateKey, DayActivity>
}

export function buildSeed(): SeedResult {
  const now = new Date()
  const today = todayKey()
  const projects: Project[] = PROJECTS.map((p) => ({
    id: `demo-${p.key}`,
    name: p.name,
    color: p.color,
    createdAt: subDays(now, 190).toISOString(),
    demo: true,
  }))
  const pid = (k?: string) => (k ? `demo-${k}` : null)

  const tasks: Task[] = TASKS.map((s, i) => {
    const done = s.status === 'done'
    const completedAt = done ? subDays(now, s.doneAgo ?? 0) : null
    if (completedAt) completedAt.setHours(Math.max(7, now.getHours() - 1 - (i % 3)), (i * 13) % 60)
    return {
      id: nanoid(10),
      title: s.title,
      notes: s.notes ?? '',
      due: s.due != null ? addDaysKey(today, s.due) : done ? toKey(completedAt!) : null,
      dueTime: s.time ?? null,
      priority: s.pri ?? 4,
      tags: s.tags ?? [],
      projectId: pid(s.p),
      energy: s.energy ?? null,
      estimate: s.est ?? null,
      subtasks: (s.subs ?? []).map(([title, d]) => ({ id: nanoid(8), title, done: d })),
      recurrence: s.rec ?? null,
      status: s.status ?? 'todo',
      completedAt: completedAt ? completedAt.toISOString() : null,
      createdAt: subDays(now, 3 + (i % 20)).toISOString(),
      plannedFor: s.plan || (done && (s.doneAgo ?? 0) === 0) ? today : null,
      order: i,
      focusMinutes: done ? 25 : s.status === 'doing' ? 50 : 0,
      ...autoOwnerFields({ title: s.title, tags: s.tags, project: PROJECTS.find((p) => p.key === s.p)?.name }),
      demo: true,
    }
  })

  // Completed recurring tasks spawn their next occurrence
  for (const t of [...tasks]) {
    if (t.status === 'done' && t.recurrence) {
      tasks.push({
        ...t,
        id: nanoid(10),
        status: 'todo',
        completedAt: null,
        plannedFor: null,
        focusMinutes: 0,
        due: nextOccurrence(t.recurrence, t.due),
        order: tasks.length,
      })
    }
  }

  // ~6 months of backdated history; gently improving trend, quieter weekends,
  // a few rest days, and an unbroken streak over the last couple of weeks.
  const rand = mulberry32(20261119)
  const demoActivity: Record<DateKey, DayActivity> = {}
  const DAYS = 183
  for (let i = DAYS; i >= 1; i--) {
    const d = subDays(now, i)
    const wd = getDay(d)
    const weekend = wd === 0 || wd === 6
    const trend = 1 - i / DAYS // 0 → 1
    const restDay = i > 14 && rand() < (weekend ? 0.35 : 0.07)
    if (restDay) continue
    const base = weekend ? 1 + rand() * 2.5 : 2.5 + rand() * 4 + trend * 2.5
    const done = Math.max(1, Math.round(base))
    const planned = done + Math.round(rand() * (weekend ? 1.5 : 3))
    const focus = Math.round((done * (14 + rand() * 18)) / 5) * 5
    demoActivity[toKey(d)] = { done, planned, focus }
  }
  // Today: completed seed tasks already count; add focus already logged this morning.
  const doneToday = tasks.filter((t) => t.completedAt && toKey(new Date(t.completedAt)) === today).length
  demoActivity[today] = { done: doneToday, planned: 0, focus: 50 }
  return { tasks, projects, demoActivity }
}
