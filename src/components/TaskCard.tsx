import { forwardRef, type HTMLAttributes } from 'react'
import { CalendarDays, Flag, ListChecks, Repeat, Timer } from 'lucide-react'
import type { Task } from '../lib/types'
import { cn, daysFromToday, dueLabel, formatMinutes, PRIORITY_META } from '../lib/utils'
import { completeTask } from '../lib/actions'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Checkbox } from './Checkbox'
import { localDay } from '../hooks/useDerived'

interface Props extends HTMLAttributes<HTMLDivElement> {
  task: Task
  dragging?: boolean
  overlay?: boolean
}

/** Compact card used by the Kanban board and Eisenhower matrix. */
export const TaskCard = forwardRef<HTMLDivElement, Props>(function TaskCard({ task, dragging, overlay, className, style, ...rest }, ref) {
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined))
  const edit = useUI((s) => s.edit)
  const startFocus = useUI((s) => s.startFocus)
  const done = task.status === 'done'
  const overdue = !done && task.due && daysFromToday(task.due) < 0
  const subDone = task.subtasks.filter((s) => s.done).length
  return (
    <div
      ref={ref}
      style={style}
      onClick={() => !dragging && edit(task.id)}
      className={cn(
        'group/card card relative cursor-grab touch-none p-3 select-none active:cursor-grabbing',
        'transition-[border-color,box-shadow,opacity] duration-150 hover:border-line-strong',
        dragging && 'opacity-30',
        overlay &&
          'rotate-[1.5deg] cursor-grabbing border-[rgba(var(--accent-rgb),0.5)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),0.35),0_24px_48px_-12px_rgba(0,0,0,0.55)]',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-2.5">
        <div className="pt-px" onPointerDown={(e) => e.stopPropagation()}>
          <Checkbox checked={done} onToggle={() => completeTask(task.id)} priority={task.priority} size={16} />
        </div>
        <div className={cn('min-w-0 flex-1 text-[13px] leading-[18px]', done ? 'text-faint line-through' : 'text-fg')}>{task.title}</div>
        {task.priority < 4 && (
          <Flag
            className="mt-0.5 size-3 shrink-0"
            style={{
              color: PRIORITY_META[task.priority].color,
              fill: `color-mix(in srgb, ${PRIORITY_META[task.priority].color} 30%, transparent)`,
            }}
          />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[26px] text-[11px] text-faint">
        {project && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ background: project.color }} />
            {project.name}
          </span>
        )}
        {done && task.completedAt ? (
          <span className="tnum inline-flex items-center gap-1">
            <CalendarDays className="size-3" />
            Done {dueLabel(localDay(task.completedAt)).toLowerCase()}
          </span>
        ) : (
          task.due && (
            <span className={cn('tnum inline-flex items-center gap-1', overdue && 'text-danger')}>
              <CalendarDays className="size-3" />
              {dueLabel(task.due)}
            </span>
          )
        )}
        {task.recurrence && <Repeat className="size-3" />}
        {task.subtasks.length > 0 && (
          <span className="tnum inline-flex items-center gap-1">
            <ListChecks className="size-3" />
            {subDone}/{task.subtasks.length}
          </span>
        )}
        {task.estimate && <span className="tnum">{formatMinutes(task.estimate)}</span>}
        {!done && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              startFocus(task.id)
            }}
            aria-label="Start focus"
            className="ml-auto inline-flex size-5 items-center justify-center rounded-[4px] opacity-0 group-hover/card:opacity-100 hover:text-accent"
          >
            <Timer className="size-3" />
          </button>
        )}
      </div>
      {task.subtasks.length > 0 && (
        <div className="mt-2.5 ml-[26px] h-[3px] overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_6%,transparent)]">
          <div
            className="h-full rounded-full bg-accent/80 transition-[width] duration-500"
            style={{ width: `${(subDone / task.subtasks.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  )
})
