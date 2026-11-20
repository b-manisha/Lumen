/**
 * Delegation piles: the machine-readable queue and the human-readable checklists that the
 * dev bridge writes to `piles/` (or the user exports when the bridge is offline).
 * Pure: no DOM, no store.
 */
import type { AgentStatus, Owner, Project, Task } from './types'
import { classify, OWNER_LABEL } from './delegate'

export interface QueueItem {
  id: string
  title: string
  notes: string
  tags: string[]
  project: string | null
  due: string | null
  dueTime: string | null
  priority: number
  owner: Owner
  ownerSource: 'auto' | 'manual'
  sortReason: string
  /** a hard human rule matched: agents must never act on this task */
  humanOnly: boolean
  subtasks: { title: string; done: boolean }[]
  agent: {
    status: AgentStatus
    by?: 'manager' | 'junior'
    /** agent note, or the CHO's feedback when a task was sent back */
    note?: string
    /** the last deliverable, so a sent-back task can be revised rather than redone */
    previousOutput?: string
  } | null
}

export interface PilesQueue {
  app: 'lumen'
  version: 1
  generatedAt: string
  counts: Record<Owner, number>
  tasks: QueueItem[]
}

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  queued: 'Queued',
  working: 'Working',
  review: 'Ready for review',
  returned: 'Returned to you',
  approved: 'Approved',
}

export function buildQueue(tasks: Task[], projects: Project[], now = new Date()): PilesQueue {
  const name = (id: string | null) => (id ? (projects.find((p) => p.id === id)?.name ?? null) : null)
  const open = tasks.filter((t) => t.status !== 'done')
  const items: QueueItem[] = open.map((t) => {
    const project = name(t.projectId)
    const humanOnly = classify({ title: t.title, tags: t.tags, project }).locked
    return {
      id: t.id,
      title: t.title,
      notes: t.notes,
      tags: t.tags,
      project,
      due: t.due,
      dueTime: t.dueTime,
      priority: t.priority,
      // defence in depth: a human-only task is never exported into an agent pile
      owner: humanOnly ? 'human' : t.owner,
      ownerSource: t.ownerSource,
      sortReason: t.sortReason,
      humanOnly,
      subtasks: t.subtasks.map((s) => ({ title: s.title, done: s.done })),
      agent: t.agent
        ? {
            status: t.agent.status,
            by: t.agent.by,
            note: t.agent.note,
            previousOutput: t.agent.status === 'queued' && t.agent.output ? t.agent.output : undefined,
          }
        : null,
    }
  })
  const counts: Record<Owner, number> = { human: 0, manager: 0, junior: 0 }
  for (const i of items) counts[i.owner]++
  return { app: 'lumen', version: 1, generatedAt: now.toISOString(), counts, tasks: items }
}

const STATUS_ORDER: AgentStatus[] = ['review', 'returned', 'working', 'queued', 'approved']

function line(t: QueueItem): string {
  const meta = [
    t.priority < 4 ? `P${t.priority}` : null,
    t.due ? `due ${t.due}${t.dueTime ? ` ${t.dueTime}` : ''}` : null,
    t.project,
    ...t.tags.map((x) => `#${x}`),
  ].filter(Boolean)
  const out = [`- [ ] **${t.title.replace(/\n/g, ' ')}**${meta.length ? ` · ${meta.join(' · ')}` : ''}  \`${t.id}\``]
  const returned = t.agent?.status === 'returned'
  const manual = t.ownerSource === 'manual' && !returned && !/by you|took this over|handed to/i.test(t.sortReason)
  // a returned task's reason is the agent's note, which is printed in full below
  if (!(returned && t.agent?.note)) out.push(`  - Why: ${t.sortReason || '—'}${manual ? ' (set by you)' : ''}`)
  if (t.agent?.note) out.push(`  - Note: ${t.agent.note.replace(/\n+/g, ' ')}`)
  if (t.notes.trim()) out.push(`  - Notes: ${t.notes.trim().replace(/\n+/g, ' ')}`)
  for (const s of t.subtasks) out.push(`  - [${s.done ? 'x' : ' '}] ${s.title}`)
  return out.join('\n')
}

/** One pile as a markdown checklist, grouped by agent status (or "returned / yours" for the human pile). */
export function pileMarkdown(q: PilesQueue, owner: Owner): string {
  const items = q.tasks.filter((t) => t.owner === owner)
  const title = owner === 'human' ? 'You · Chief Human Officer' : OWNER_LABEL[owner]
  const head = [
    `# ${title}`,
    '',
    `_${items.length} open task${items.length === 1 ? '' : 's'} · generated ${q.generatedAt} by Lumen. Regenerated on every change: edit tasks in the app, not here._`,
    '',
  ]
  if (!items.length) return [...head, '_Nothing in this pile._', ''].join('\n')

  const groups: [string, QueueItem[]][] =
    owner === 'human'
      ? [
          ['Returned by agents', items.filter((t) => t.agent?.status === 'returned')],
          ['Ready for your review', items.filter((t) => t.agent?.status === 'review')],
          ['Yours', items.filter((t) => !t.agent || (t.agent.status !== 'returned' && t.agent.status !== 'review'))],
        ]
      : STATUS_ORDER.map((s) => [AGENT_STATUS_LABEL[s], items.filter((t) => (t.agent?.status ?? 'queued') === s)])

  const body = groups
    .filter(([, list]) => list.length)
    .map(([name, list]) => [`## ${name} (${list.length})`, '', ...list.map(line), ''].join('\n'))
  return [...head, ...body].join('\n')
}

export function allPileFiles(q: PilesQueue): Record<'queue.json' | 'human.md' | 'manager.md' | 'junior.md', string> {
  return {
    'queue.json': JSON.stringify(q, null, 2) + '\n',
    'human.md': pileMarkdown(q, 'human'),
    'manager.md': pileMarkdown(q, 'manager'),
    'junior.md': pileMarkdown(q, 'junior'),
  }
}
