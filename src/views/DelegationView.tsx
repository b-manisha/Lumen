import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { AnimatePresence, motion } from 'motion/react'
import * as Popover from '@radix-ui/react-popover'
import { Download, FileJson, FileText, Lock, RefreshCw, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentStatus, Owner, Task } from '../lib/types'
import { cn, compareTasks, isOpen } from '../lib/utils'
import { classify } from '../lib/delegate'
import { BRIDGE_AVAILABLE, downloadAllPiles, downloadPileFile, syncPiles, useBridge } from '../lib/bridge'
import { EXPO_OUT } from '../lib/motion'
import { applyFilters, useFilters, useNow } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { ViewHeader } from '../components/ViewHeader'
import { FilterBar } from '../components/FilterBar'
import { TaskCard } from '../components/TaskCard'
import { QuickAdd } from '../components/QuickAdd'
import { AgentStatusPill, OWNER_META, OwnerAvatar } from '../components/Owner'
import { Button, Tip } from '../components/ui'

const PILES: Owner[] = ['human', 'manager', 'junior']
const STATUS_ORDER: (AgentStatus | 'none')[] = ['review', 'returned', 'working', 'queued', 'approved', 'none']
type StatusFilter = 'all' | AgentStatus

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'review', label: 'Ready for review' },
  { value: 'working', label: 'Working' },
  { value: 'queued', label: 'Queued' },
  { value: 'returned', label: 'Returned' },
  { value: 'approved', label: 'Approved' },
]

const pileId = (o: Owner) => `pile-${o}`

// pointer drops land on the column under the cursor; keyboard drags fall back to overlap
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

export function DelegationView() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const setOwner = useStore((s) => s.setOwner)
  const resortAll = useStore((s) => s.resortAll)
  const filters = useFilters()
  const setVisible = useUI((s) => s.setVisible)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [activeId, setActiveId] = useState<string | null>(null)

  const open = useMemo(() => tasks.filter(isOpen), [tasks])
  const statusCounts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: open.length, queued: 0, working: 0, review: 0, returned: 0, approved: 0 }
    for (const t of open) if (t.agent) c[t.agent.status]++
    return c
  }, [open])

  const columns = useMemo(() => {
    const list = applyFilters(open, filters).filter((t) => status === 'all' || t.agent?.status === status)
    const rank = (t: Task) => STATUS_ORDER.indexOf(t.agent?.status ?? 'none')
    const by: Record<Owner, Task[]> = { human: [], manager: [], junior: [] }
    for (const t of list) by[t.owner].push(t)
    for (const o of PILES) by[o].sort((a, b) => rank(a) - rank(b) || compareTasks(a, b))
    return by
  }, [open, filters, status])

  useEffect(() => setVisible(PILES.flatMap((o) => columns[o].map((t) => t.id))), [columns, setVisible])

  // tasks a hard human rule keeps out of the agent piles
  const lockedIds = useMemo(() => {
    const name = (id: string | null) => (id ? projects.find((p) => p.id === id)?.name : undefined)
    return new Set(open.filter((t) => classify({ title: t.title, tags: t.tags, project: name(t.projectId) }).locked).map((t) => t.id))
  }, [open, projects])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor))
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined
  const activeLocked = !!activeId && lockedIds.has(activeId)

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id))
  const onEnd = (e: DragEndEvent) => {
    setActiveId(null)
    const id = String(e.active.id)
    const to = PILES.find((o) => pileId(o) === e.over?.id)
    const t = tasks.find((x) => x.id === id)
    if (!t || !to || to === t.owner) return
    const res = setOwner(id, to)
    if (!res.ok) {
      toast.error('This one stays with you', { description: `${res.reason}. Agents never take calls, payments, bookings or personal matters.` })
      return
    }
    toast(to === 'human' ? `“${t.title}” is yours now` : `Delegated to the ${OWNER_META[to].label}`, {
      description: to === 'human' ? undefined : 'Queued for the next agent run.',
      duration: 2600,
    })
  }

  const onResort = () => {
    const moved = resortAll()
    toast(moved ? `Re-sorted · ${moved} task${moved === 1 ? '' : 's'} changed pile` : 'Re-sorted · every pile was already right', {
      description: 'Only auto-sorted tasks move. Your manual choices are kept.',
      action: { label: 'Undo', onClick: () => useStore.getState().undo() },
    })
  }

  const review = statusCounts.review
  return (
    <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col">
      <ViewHeader
        icon={<Users />}
        title="Delegation"
        sub={`${open.length} open · ${review} ready for review · drag cards between piles to reassign`}
        right={
          <>
            <BridgeIndicator />
            <Tip content="Re-run auto-sort on every auto-sorted task">
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} onClick={onResort}>
                Re-sort all
              </Button>
            </Tip>
          </>
        }
      >
        <QuickAdd placeholder="Add and auto-sort… (^me ^mgr ^jr to choose a pile)" />
        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <FilterBar className="min-w-0 flex-1" />
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Agent status">
            {FILTERS.map((f) => {
              const on = status === f.value
              const n = statusCounts[f.value]
              return (
                <button
                  key={f.value}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setStatus(on && f.value !== 'all' ? 'all' : f.value)}
                  className={cn(
                    'press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ctl border px-2 text-xs font-medium whitespace-nowrap',
                    on ? 'border-[rgba(var(--accent-rgb),0.45)] bg-accent-soft text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {f.label}
                  <span className={cn('tnum text-[11px]', on ? 'text-accent' : 'text-faint', f.value === 'review' && n > 0 && !on && 'text-accent')}>
                    {n}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </ViewHeader>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onStart}
        onDragEnd={onEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid flex-1 grid-cols-1 gap-4 pb-16 md:grid-cols-3">
          {PILES.map((o, i) => (
            <motion.div
              key={o}
              className="min-w-0 md:h-full"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EXPO_OUT, delay: i * 0.06 }}
            >
              <Pile
                owner={o}
                tasks={columns[o]}
                total={open.filter((t) => t.owner === o).length}
                activeId={activeId}
                blocked={activeLocked && o !== 'human'}
                lockedIds={lockedIds}
                filtered={status !== 'all'}
              />
            </motion.div>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
          {active ? <TaskCard task={active} overlay showOwner={false} footer={<CardFooter task={active} locked={activeLocked} />} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function Pile({
  owner,
  tasks,
  total,
  activeId,
  blocked,
  lockedIds,
  filtered,
}: {
  owner: Owner
  tasks: Task[]
  total: number
  activeId: string | null
  blocked: boolean
  lockedIds: Set<string>
  filtered: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: pileId(owner) })
  const m = OWNER_META[owner]
  const human = owner === 'human'
  const counts = useMemo(() => {
    const c = { review: 0, working: 0, queued: 0, returned: 0 }
    for (const t of tasks) if (t.agent && t.agent.status in c) c[t.agent.status as keyof typeof c]++
    return c
  }, [tasks])

  return (
    <section
      ref={setNodeRef}
      aria-label={m.long}
      className={cn(
        'relative flex h-full min-h-[360px] flex-col overflow-hidden rounded-card border p-2 transition-[border-color,background-color,opacity] duration-200',
        human ? 'border-[rgba(var(--cho-rgb),0.22)]' : 'border-line',
        isOver && !blocked && 'border-[rgba(var(--pile-rgb),0.6)]',
        blocked && 'opacity-55',
      )}
      style={
        {
          '--pile-rgb': m.rgb,
          background: `linear-gradient(180deg, rgba(${m.rgb}, ${human ? 0.1 : 0.05}), transparent 160px), color-mix(in srgb, var(--text) ${isOver && !blocked ? 3 : 1.5}%, transparent)`,
        } as React.CSSProperties
      }
    >
      {/* lit top edge */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${m.rgb}, ${human ? 0.7 : 0.45}), transparent)` }}
      />
      <header className="flex items-start gap-3 px-2 pt-2 pb-3">
        <OwnerAvatar owner={owner} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[13.5px] font-semibold text-fg">{human ? 'You' : m.label}</h2>
            {human && (
              <span
                className="hidden rounded-full border px-1.5 py-px text-[10px] font-medium tracking-wide uppercase xl:inline"
                style={{ color: m.color, borderColor: `rgba(${m.rgb}, 0.3)`, background: `rgba(${m.rgb}, 0.08)` }}
              >
                Chief Human Officer
              </span>
            )}
            <span className="tnum ml-auto rounded-full bg-surface-hover px-1.5 text-[11px] text-faint">
              {filtered ? `${tasks.length}/${total}` : total}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-pretty text-faint">{human ? 'Calls, decisions, errands, money, anything personal' : m.blurb}</p>
          {!human && (counts.review > 0 || counts.working > 0) && (
            <div className="tnum mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
              {counts.review > 0 && <span className="text-accent">{counts.review} ready for review</span>}
              {counts.working > 0 && <span className="text-info">{counts.working} working</span>}
            </div>
          )}
          {human && counts.returned > 0 && (
            <div className="tnum mt-1.5 text-[11px]" style={{ color: m.color }}>
              {counts.returned} returned by agents
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-2">
        <AnimatePresence initial={false}>
          {tasks.map((t) => (
            <DraggableCard key={t.id} task={t} hidden={t.id === activeId} locked={lockedIds.has(t.id)} />
          ))}
        </AnimatePresence>
        {tasks.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-row border border-dashed border-line p-6 text-center text-xs text-faint">
            {blocked ? (
              <>
                <Lock className="mb-1 size-4" />
                This task needs a human
              </>
            ) : filtered ? (
              'Nothing with this status here'
            ) : human ? (
              'Nothing needs you right now. Rare. Enjoy it.'
            ) : (
              <>
                Drag a task here to delegate it
                <span className="text-[11px] text-faint/80">or add one with {owner === 'manager' ? '^mgr' : '^jr'}</span>
              </>
            )}
          </div>
        )}
        {blocked && tasks.length > 0 && isOver && (
          <div className="flex items-center justify-center gap-1.5 rounded-row border border-dashed border-line py-3 text-xs text-faint">
            <Lock className="size-3.5" /> Human-only task
          </div>
        )}
      </div>
    </section>
  )
}

function CardFooter({ task, locked }: { task: Task; locked: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {task.agent && <AgentStatusPill status={task.agent.status} />}
      <span className="inline-flex min-w-0 items-center gap-1 text-[11px] leading-[15px] text-faint">
        {locked && <Lock className="size-2.5 shrink-0" aria-label="Human only" />}
        <span className="min-w-0 truncate" title={task.sortReason}>
          {task.sortReason || (task.ownerSource === 'manual' ? 'Set by you' : '')}
        </span>
      </span>
    </div>
  )
}

function DraggableCard({ task, hidden, locked }: { task: Task; hidden: boolean; locked: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 34 }}
    >
      <TaskCard
        ref={setNodeRef}
        task={task}
        dragging={hidden}
        showOwner={false}
        footer={<CardFooter task={task} locked={locked} />}
        className={cn(task.agent?.status === 'review' && 'border-[rgba(var(--accent-rgb),0.35)]')}
        {...attributes}
        {...listeners}
      />
    </motion.div>
  )
}

function BridgeIndicator() {
  const status = useBridge((s) => s.status)
  const lastSync = useBridge((s) => s.lastSync)
  const now = useNow(5000)
  const ago = lastSync ? Math.max(0, Math.round((now.getTime() - lastSync) / 1000)) : null
  const connected = status === 'connected'
  const label = connected ? 'Agents connected' : status === 'checking' ? 'Connecting…' : 'Offline'
  const color = connected ? 'var(--success)' : status === 'checking' ? 'var(--text-faint)' : 'var(--warning)'

  const pill = (
    <span
      className="inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap"
      style={{ color: connected ? 'var(--text)' : 'var(--text-muted)', borderColor: `color-mix(in srgb, ${color} 28%, var(--border))` }}
    >
      <span className="relative flex size-2">
        {connected && <span className="pulse-dot absolute inset-0 rounded-full" style={{ background: color, opacity: 0.5 }} />}
        <span className="relative size-2 rounded-full" style={{ background: color, boxShadow: connected ? `0 0 8px ${color}` : undefined }} />
      </span>
      {label}
    </span>
  )

  return (
    <div className="flex items-center gap-2">
      <Tip
        content={
          connected ? (
            <span>
              Writing <code className="font-mono">piles/</code> for Claude Code
              {ago != null && <span className="text-muted"> · synced {ago < 5 ? 'just now' : `${ago}s ago`}</span>}
              <span className="block text-[11px] text-faint">Ask Claude Code to “run the piles”.</span>
            </span>
          ) : BRIDGE_AVAILABLE ? (
            'The dev bridge isn’t answering. Is `npm run dev` running?'
          ) : (
            'No bridge in this build. Export the piles and hand them to Claude Code.'
          )
        }
      >
        {connected ? (
          <button onClick={() => void syncPiles(true).then((ok) => ok && toast('Piles synced', { duration: 1600 }))} className="press rounded-full">
            {pill}
          </button>
        ) : (
          pill
        )}
      </Tip>
      {!connected && <ExportMenu />}
    </div>
  )
}

function ExportMenu() {
  const item =
    'press flex h-8 w-full items-center gap-2 rounded-ctl px-2 text-left text-[12.5px] text-muted hover:bg-surface-hover hover:text-fg [&>svg]:size-3.5 [&>svg]:text-faint'
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />}>
          Export
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="elevated z-[70] w-[220px] rounded-row p-1.5">
          <div className="px-2 pt-1 pb-1.5 text-[11px] text-faint">Hand these files to Claude Code</div>
          <button className={item} onClick={downloadAllPiles}>
            <Download /> All four files
          </button>
          <div className="my-1 h-px bg-line" />
          <button className={item} onClick={() => downloadPileFile('queue.json')}>
            <FileJson /> queue.json
          </button>
          {(['human.md', 'manager.md', 'junior.md'] as const).map((f) => (
            <button key={f} className={item} onClick={() => downloadPileFile(f)}>
              <FileText /> {f}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
