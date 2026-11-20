import type { Energy, Task } from './types'
import { daysFromToday, isOpen } from './utils'

export type SuggestReason = 'overdue' | 'priority' | 'due-soon' | 'in-progress' | 'backlog'

export interface Suggestion {
  task: Task
  score: number
  reason: SuggestReason
}

export const REASON_LABEL: Record<SuggestReason, string> = {
  overdue: 'Overdue',
  priority: 'High priority',
  'due-soon': 'Due soon',
  'in-progress': 'In progress',
  backlog: 'From backlog',
}

/**
 * Local "Plan my day" heuristic:
 *   overdue first → high priority → due soon → in progress → the rest,
 *   filtered by the chosen energy level (tasks without an energy tag always qualify).
 */
export function suggestForToday(tasks: Task[], energy: Energy | 'any'): Suggestion[] {
  const out: Suggestion[] = []
  for (const t of tasks) {
    if (!isOpen(t)) continue
    if (energy !== 'any' && t.energy && t.energy !== energy) continue
    const d = t.due ? daysFromToday(t.due) : null
    let score = 0
    let reason: SuggestReason = 'backlog'
    if (d != null && d < 0) {
      score = 1000 + Math.min(-d, 30) * 5
      reason = 'overdue'
    } else if (t.priority <= 2) {
      score = 700 + (3 - t.priority) * 60 + (d != null && d <= 3 ? 40 : 0)
      reason = 'priority'
    } else if (d != null && d <= 3) {
      score = 500 + (3 - d) * 30
      reason = 'due-soon'
    } else if (t.status === 'doing') {
      score = 400
      reason = 'in-progress'
    } else {
      score = 100 + (5 - t.priority) * 10 - (d ?? 30)
    }
    if (energy !== 'any' && t.energy === energy) score += 25
    out.push({ task: t, score, reason })
  }
  return out.sort((a, b) => b.score - a.score)
}
