import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { CalendarClock, Flame, Grid2x2, Trash, Users } from 'lucide-react'
import type { Task } from '../lib/types'
import { addDaysKey, cn, compareTasks, daysFromToday, isOpen, todayKey } from '../lib/utils'
import { EXPO_OUT } from '../lib/motion'
import { applyFilters, useFilters } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { ViewHeader } from '../components/ViewHeader'
import { FilterBar } from '../components/FilterBar'
import { TaskCard } from '../components/TaskCard'

type QId = 'do' | 'schedule' | 'delegate' | 'eliminate'

const Q: { id: QId; title: string; sub: string; color: string; icon: React.ReactNode; urgent: boolean; important: boolean }[] = [
  { id: 'do', title: 'Do first', sub: 'Urgent · Important', color: 'var(--danger)', icon: <Flame />, urgent: true, important: true },
  {
    id: 'schedule',
    title: 'Schedule',
    sub: 'Not urgent · Important',
    color: 'var(--accent)',
    icon: <CalendarClock />,
    urgent: false,
    important: true,
  },
  {
    id: 'delegate',
    title: 'Delegate',
    sub: 'Urgent · Not important',
    color: 'var(--warning)',
    icon: <Users />,
    urgent: true,
    important: false,
  },
  {
    id: 'eliminate',
    title: 'Eliminate',
    sub: 'Not urgent · Not important',
    color: 'var(--text-faint)',
    icon: <Trash />,
    urgent: false,
    important: false,
  },
]

const isUrgent = (t: Task) => !!t.due && daysFromToday(t.due) <= 1
const isImportant = (t: Task) => t.priority <= 2

function quadrantOf(t: Task): QId {
  const u = isUrgent(t)
  const i = isImportant(t)
  return u && i ? 'do' : i ? 'schedule' : u ? 'delegate' : 'eliminate'
}

export function MatrixView() {
  const tasks = useStore((s) => s.tasks)
  const update = useStore((s) => s.updateTask)
  const filters = useFilters()
  const setVisible = useUI((s) => s.setVisible)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))

  const grouped = useMemo(() => {
    const g: Record<QId, Task[]> = { do: [], schedule: [], delegate: [], eliminate: [] }
    for (const t of applyFilters(tasks.filter(isOpen), filters).sort(compareTasks)) g[quadrantOf(t)].push(t)
    return g
  }, [tasks, filters])
  useEffect(() => setVisible(Q.flatMap((q) => grouped[q.id].map((t) => t.id))), [grouped, setVisible])

  const onEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const t = tasks.find((x) => x.id === e.active.id)
    const target = Q.find((q) => q.id === e.over?.id)
    if (!t || !target || quadrantOf(t) === target.id) return
    const patch: Partial<Task> = {}
    const notes: string[] = []
    if (target.important && !isImportant(t)) {
      patch.priority = 2
      notes.push('priority → P2')
    }
    if (!target.important && isImportant(t)) {
      patch.priority = 3
      notes.push('priority → P3')
    }
    if (target.urgent && !isUrgent(t)) {
      patch.due = todayKey()
      notes.push('due → today')
    }
    if (!target.urgent && isUrgent(t)) {
      patch.due = addDaysKey(todayKey(), 4)
      notes.push('due → in 4 days')
    }
    update(t.id, patch)
    toast(`Moved to ${target.title}`, { description: notes.join(' · ') })
  }

  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <ViewHeader
        icon={<Grid2x2 />}
        title="Eisenhower matrix"
        sub="Urgent = due within a day · Important = priority P1–P2. Drag to re-prioritise."
      >
        <FilterBar />
      </ViewHeader>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={onEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="relative grid grid-cols-1 gap-4 pb-16 md:grid-cols-2">
          {Q.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: EXPO_OUT, delay: i * 0.06 }}
            >
              <Quadrant q={q} tasks={grouped[q.id]} activeId={activeId} />
            </motion.div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {active ? <TaskCard task={active} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function Quadrant({ q, tasks, activeId }: { q: (typeof Q)[number]; tasks: Task[]; activeId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: q.id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'card flex h-[min(46vh,420px)] min-h-[260px] flex-col overflow-hidden transition-[border-color,box-shadow] duration-200',
        isOver && 'border-transparent',
      )}
      style={
        {
          background: `radial-gradient(120% 60% at 0% 0%, color-mix(in srgb, ${q.color} ${isOver ? 14 : 7}%, transparent), transparent 60%), var(--surface)`,
          boxShadow: isOver ? `0 0 0 1px ${q.color}, 0 0 32px -8px ${q.color}` : undefined,
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span
          className="flex size-7 items-center justify-center rounded-ctl border [&>svg]:size-3.5"
          style={{
            color: q.color,
            borderColor: `color-mix(in srgb, ${q.color} 30%, transparent)`,
            background: `color-mix(in srgb, ${q.color} 10%, transparent)`,
          }}
        >
          {q.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{q.title}</div>
          <div className="text-[11px] text-faint">{q.sub}</div>
        </div>
        <span className="display tnum text-[20px] text-muted">{tasks.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} hidden={t.id === activeId} />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-row border border-dashed border-line text-xs text-faint">
            {q.id === 'do' ? 'No fires right now.' : q.id === 'eliminate' ? 'Nothing to let go of.' : 'Drop tasks here'}
          </div>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ task, hidden }: { task: Task; hidden: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return <TaskCard ref={setNodeRef} task={task} dragging={hidden} {...attributes} {...listeners} />
}
