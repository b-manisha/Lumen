import { useEffect, useMemo, useState } from 'react'
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { motion } from 'motion/react'
import { CircleCheck, CircleDashed, CircleDot, SquareKanban } from 'lucide-react'
import type { Status, Task } from '../lib/types'
import { cn } from '../lib/utils'
import { completeTask } from '../lib/actions'
import { EXPO_OUT } from '../lib/motion'
import { applyFilters, useFilters } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { ViewHeader } from '../components/ViewHeader'
import { FilterBar } from '../components/FilterBar'
import { TaskCard } from '../components/TaskCard'
import { QuickAdd } from '../components/QuickAdd'

const COLUMNS: { id: Status; title: string; icon: React.ReactNode; color: string }[] = [
  { id: 'todo', title: 'To do', icon: <CircleDashed />, color: 'var(--text-muted)' },
  { id: 'doing', title: 'In progress', icon: <CircleDot />, color: 'var(--warning)' },
  { id: 'done', title: 'Done', icon: <CircleCheck />, color: 'var(--success)' },
]

type Columns = Record<Status, string[]>

export function BoardView() {
  const tasks = useStore((s) => s.tasks)
  const setStatus = useStore((s) => s.setStatus)
  const setOrder = useStore((s) => s.setOrder)
  const filters = useFilters()
  const setVisible = useUI((s) => s.setVisible)
  const [activeId, setActiveId] = useState<string | null>(null)

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const base = useMemo<Columns>(() => {
    const f = applyFilters(tasks, filters)
    const col = (s: Status) => f.filter((t) => t.status === s)
    return {
      todo: col('todo')
        .sort((a, b) => a.order - b.order)
        .map((t) => t.id),
      doing: col('doing')
        .sort((a, b) => a.order - b.order)
        .map((t) => t.id),
      done: col('done')
        .sort((a, b) => ((b.completedAt ?? '') > (a.completedAt ?? '') ? 1 : -1))
        .slice(0, 25)
        .map((t) => t.id),
    }
  }, [tasks, filters])
  // Local working copy while dragging for smooth cross-column previews; null when idle, so the
  // board renders straight from the store instead of syncing a copy in an effect.
  const [dragCols, setDragCols] = useState<Columns | null>(null)
  const cols = dragCols ?? base
  useEffect(() => setVisible([...base.todo, ...base.doing]), [base, setVisible])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const findCol = (id: string): Status | null => {
    if (id === 'todo' || id === 'doing' || id === 'done') return id
    return (Object.keys(cols) as Status[]).find((k) => cols[k].includes(id)) ?? null
  }

  const onStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setDragCols(base)
  }

  const onOver = (e: DragOverEvent) => {
    const over = e.over?.id
    if (!over) return
    const from = findCol(String(e.active.id))
    const to = findCol(String(over))
    if (!from || !to || from === to) return
    setDragCols((prev) => {
      const c = prev ?? base
      const fromList = c[from].filter((x) => x !== e.active.id)
      const toList = [...c[to]]
      const idx = toList.indexOf(String(over))
      toList.splice(idx < 0 ? toList.length : idx, 0, String(e.active.id))
      return { ...c, [from]: fromList, [to]: toList }
    })
  }

  const onEnd = (e: DragEndEvent) => {
    const id = String(e.active.id)
    const over = e.over?.id
    setActiveId(null)
    setDragCols(null)
    if (!over) return
    const to = findCol(String(over))
    if (!to) return
    let list = cols[to]
    const oldIdx = list.indexOf(id)
    const newIdx = list.indexOf(String(over))
    if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) list = arrayMove(list, oldIdx, newIdx)
    const task = byId.get(id)
    if (!task) return
    if (task.status !== to) {
      if (to === 'done' || task.status === 'done') {
        completeTask(id)
        if (to === 'doing') setStatus(id, 'doing')
      } else setStatus(id, to)
    }
    if (to !== 'done') setOrder(list)
  }

  const active = activeId ? byId.get(activeId) : undefined

  return (
    <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col">
      <ViewHeader icon={<SquareKanban />} title="Board" sub="Drag cards between columns to change status">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <QuickAdd placeholder="Add to To do… (#tag !high tomorrow)" />
        </div>
        <FilterBar className="mt-3" />
      </ViewHeader>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onStart}
        onDragOver={onOver}
        onDragEnd={onEnd}
        onDragCancel={() => {
          setActiveId(null)
          setDragCols(null)
        }}
      >
        <div className="grid flex-1 grid-cols-1 gap-4 pb-16 md:grid-cols-3">
          {COLUMNS.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EXPO_OUT, delay: i * 0.06 }}
            >
              <Column col={c} ids={cols[c.id]} byId={byId} activeId={activeId} />
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

function Column({
  col,
  ids,
  byId,
  activeId,
}: {
  col: (typeof COLUMNS)[number]
  ids: string[]
  byId: Map<string, Task>
  activeId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id })
  const tasks = ids.map((id) => byId.get(id)).filter((t): t is Task => !!t)
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[320px] flex-col rounded-card border border-line bg-[color-mix(in_srgb,var(--text)_1.5%,transparent)] p-2 transition-[border-color,background-color] duration-200',
        isOver && 'border-[rgba(var(--accent-rgb),0.45)] bg-accent-soft',
      )}
    >
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-3">
        <span className="[&>svg]:size-3.5" style={{ color: col.color }}>
          {col.icon}
        </span>
        <span className="text-[13px] font-semibold text-fg">{col.title}</span>
        <span className="tnum rounded-full bg-surface-hover px-1.5 text-[11px] text-faint">{tasks.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((t) => (
            <SortableCard key={t.id} task={t} hidden={t.id === activeId} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-row border border-dashed border-line p-6 text-center text-xs text-faint">
              {col.id === 'doing'
                ? 'Drag a card here when you start it'
                : col.id === 'done'
                  ? 'Finished work lands here'
                  : 'Nothing to do. Nice.'}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

function SortableCard({ task, hidden }: { task: Task; hidden: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id })
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      dragging={hidden}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
    />
  )
}
