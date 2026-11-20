import { memo, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { AlignLeft, Battery, BatteryFull, CalendarDays, Clock, Flag, ListChecks, Repeat, Timer } from 'lucide-react'
import type { Task } from '../lib/types'
import { cn, daysFromToday, dueLabel, formatMinutes, formatTime, PRIORITY_META } from '../lib/utils'
import { describeRecurrence } from '../lib/recurrence'
import { completeTask } from '../lib/actions'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Checkbox } from './Checkbox'
import { Tip } from './ui'
import { localDay } from '../hooks/useDerived'
import { OwnerGlyph, OWNER_META } from './Owner'
import { AGENT_STATUS_LABEL } from '../lib/piles'

interface Props {
  task: Task
  showProject?: boolean
  compact?: boolean
  /** render without the outer row chrome (e.g. on cards) */
  bare?: boolean
}

export const TaskItem = memo(function TaskItem({ task, showProject = true, compact, bare }: Props) {
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined))
  const selected = useUI((s) => s.selectedId === task.id)
  const edit = useUI((s) => s.edit)
  const select = useUI((s) => s.select)
  const startFocus = useUI((s) => s.startFocus)
  const reduce = useReducedMotion()
  const [pending, setPending] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const rowRef = useRef<HTMLDivElement>(null)
  const done = task.status === 'done'
  const checked = done || pending

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const onToggle = () => {
    if (done) return completeTask(task.id)
    if (pending) return
    setPending(true)
    timer.current = window.setTimeout(
      () => {
        completeTask(task.id)
        setPending(false)
      },
      reduce ? 0 : 480,
    )
  }

  const overdue = !done && task.due && daysFromToday(task.due) < 0
  const isDueToday = !done && task.due && daysFromToday(task.due) === 0
  const subDone = task.subtasks.filter((s) => s.done).length

  return (
    <div
      ref={rowRef}
      data-task-id={task.id}
      onClick={() => {
        select(task.id)
        edit(task.id)
      }}
      className={cn(
        'group/row relative flex cursor-default items-start gap-3 transition-colors duration-150',
        !bare && 'rounded-row px-3 hover:bg-surface-hover',
        !bare && (compact ? 'py-2' : 'py-2.5'),
        selected && !bare && 'bg-surface-hover shadow-[inset_0_0_0_1px_var(--border)]',
      )}
    >
      {selected && !bare && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" />}
      <div className="pt-[1px]">
        <Checkbox checked={checked} onToggle={onToggle} priority={task.priority} label={`Complete ${task.title}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="relative min-w-0 truncate">
            <span className={cn('text-[13.5px] leading-[20px] transition-colors duration-200', checked ? 'text-faint' : 'text-fg')}>
              {task.title}
            </span>
            <motion.span
              aria-hidden
              className="absolute top-1/2 left-0 h-px w-full origin-left bg-[var(--text-faint)]"
              initial={false}
              animate={{ scaleX: checked ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
          {task.notes && <AlignLeft className="size-3 shrink-0 text-faint" aria-label="Has notes" />}
        </div>
        {!compact || task.due || task.tags.length ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint empty:hidden">
            {task.due && (
              <span className={cn('tnum inline-flex items-center gap-1', overdue && 'text-danger', isDueToday && 'text-accent')}>
                <CalendarDays className="size-3" />
                {done && task.completedAt ? `Done ${dueLabel(localDay(task.completedAt)).toLowerCase()}` : dueLabel(task.due)}
                {task.dueTime && !done && <span className="text-faint">· {formatTime(task.dueTime)}</span>}
              </span>
            )}
            {!task.due && done && task.completedAt && (
              <span className="tnum inline-flex items-center gap-1">
                <CalendarDays className="size-3" />
                Done {dueLabel(localDay(task.completedAt)).toLowerCase()}
              </span>
            )}
            {task.recurrence && (
              <span className="inline-flex items-center gap-1">
                <Repeat className="size-3" />
                {describeRecurrence(task.recurrence)}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className={cn('tnum inline-flex items-center gap-1', subDone === task.subtasks.length && 'text-success')}>
                <ListChecks className="size-3" />
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {task.estimate && (
              <span className="tnum inline-flex items-center gap-1">
                <Clock className="size-3" />
                {formatMinutes(task.estimate)}
              </span>
            )}
            {task.energy && (
              <span className={cn('inline-flex items-center gap-1', task.energy === 'high' ? 'text-warning/90' : 'text-info/90')}>
                {task.energy === 'high' ? <BatteryFull className="size-3" /> : <Battery className="size-3" />}
                {/* icon-only on phones keeps metadata to one or two lines */}
                <span className="hidden sm:inline">{task.energy === 'high' ? 'High energy' : 'Low energy'}</span>
              </span>
            )}
            {task.tags.slice(0, 3).map((t) => (
              <span key={t} className="hidden text-muted/80 sm:inline">
                #{t}
              </span>
            ))}
            {showProject && project && (
              <span className="inline-flex items-center gap-1.5 text-muted/90">
                <span className="size-1.5 rounded-full" style={{ background: project.color }} />
                {project.name}
              </span>
            )}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-[1px]">
        {!done && (
          <Tip content="Start focus · F">
            <button
              aria-label="Start focus"
              onClick={(e) => {
                e.stopPropagation()
                startFocus(task.id)
              }}
              className="press hidden size-6 items-center justify-center rounded-ctl text-faint opacity-0 group-hover/row:opacity-100 hover:bg-surface hover:text-accent focus-visible:opacity-100 sm:inline-flex"
            >
              <Timer className="size-3.5" />
            </button>
          </Tip>
        )}
        <OwnerGlyph
          owner={task.owner}
          tip={
            <span>
              {OWNER_META[task.owner].label}
              {task.agent && <span className="text-muted"> · {AGENT_STATUS_LABEL[task.agent.status]}</span>}
              {task.sortReason && <span className="block text-[11px] text-faint">{task.sortReason}</span>}
            </span>
          }
        />
        {task.priority < 4 && (
          <Flag
            className="size-3.5"
            style={{
              color: PRIORITY_META[task.priority].color,
              fill: `color-mix(in srgb, ${PRIORITY_META[task.priority].color} 30%, transparent)`,
            }}
            aria-label={`Priority ${PRIORITY_META[task.priority].label}`}
          />
        )}
      </div>
    </div>
  )
})
