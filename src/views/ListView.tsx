import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { format } from 'date-fns'
import { Archive, CalendarRange, ChevronRight, Inbox, Sun, Sunrise, Timer, Trash2 } from 'lucide-react'
import type { Task, ViewId } from '../lib/types'
import { addDaysKey, compareTasks, daysFromToday, fromKey, isOpen, todayKey } from '../lib/utils'
import { applyFilters, localDay, useFilters, useNow, useTodayTasks } from '../hooks/useDerived'
import { EXPO_OUT } from '../lib/motion'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { ViewHeader } from '../components/ViewHeader'
import { FilterBar } from '../components/FilterBar'
import { QuickAdd } from '../components/QuickAdd'
import { TaskList } from '../components/TaskList'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui'
import { toast } from 'sonner'

interface Group {
  id: string
  title: ReactNode
  meta?: ReactNode
  tasks: Task[]
  tone?: 'danger' | 'accent'
  collapsible?: boolean
}

export function ListView({ view }: { view: Exclude<ViewId, { kind: 'dashboard' | 'matrix' | 'board' }> }) {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const filters = useFilters()
  const setVisible = useUI((s) => s.setVisible)
  const open = useUI((s) => s.open)
  const startFocus = useUI((s) => s.startFocus)
  const { open: todayOpen, doneToday } = useTodayTasks()
  const now = useNow()
  const today = todayKey()
  const project = view.kind === 'project' ? projects.find((p) => p.id === view.id) : undefined

  const groups = useMemo<Group[]>(() => {
    const f = (list: Task[]) => applyFilters(list, filters)
    switch (view.kind) {
      case 'inbox':
        return [{ id: 'inbox', title: 'Inbox', tasks: f(tasks.filter((t) => isOpen(t) && !t.projectId)).sort(compareTasks) }]
      case 'today': {
        const list = f(todayOpen)
        return [
          { id: 'overdue', title: 'Overdue', tasks: list.filter((t) => t.due && t.due < today), tone: 'danger' },
          { id: 'today', title: 'Today', tasks: list.filter((t) => !(t.due && t.due < today)), tone: 'accent' },
          { id: 'done', title: 'Completed today', tasks: f(doneToday), collapsible: true },
        ]
      }
      case 'upcoming': {
        const open = f(tasks.filter((t) => isOpen(t) && t.due && t.due > today)).sort(compareTasks)
        const out: Group[] = []
        for (let i = 1; i <= 14; i++) {
          const k = addDaysKey(today, i)
          const day = open.filter((t) => t.due === k)
          const d = fromKey(k)
          out.push({
            id: k,
            title: i === 1 ? 'Tomorrow' : format(d, 'EEEE'),
            meta: format(d, 'd MMM'),
            tasks: day,
          })
        }
        const later = open.filter((t) => t.due! > addDaysKey(today, 14))
        if (later.length) out.push({ id: 'later', title: 'Later', tasks: later })
        return out
      }
      case 'logbook': {
        const done = f(tasks.filter((t) => t.status === 'done' && t.completedAt)).sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))
        const byDay = new Map<string, Task[]>()
        for (const t of done.slice(0, 300)) {
          const k = localDay(t.completedAt!)
          byDay.set(k, [...(byDay.get(k) ?? []), t])
        }
        return [...byDay.entries()].map(([k, list]) => {
          const n = daysFromToday(k)
          return {
            id: k,
            title: n === 0 ? 'Today' : n === -1 ? 'Yesterday' : format(fromKey(k), 'EEEE'),
            meta: format(fromKey(k), 'd MMM yyyy'),
            tasks: list,
          }
        })
      }
      case 'project': {
        const list = tasks.filter((t) => t.projectId === view.id)
        return [
          { id: 'open', title: 'Open', tasks: f(list.filter(isOpen)).sort(compareTasks) },
          {
            id: 'done',
            title: 'Completed',
            tasks: f(list.filter((t) => t.status === 'done')).sort((a, b) => ((b.completedAt ?? '') > (a.completedAt ?? '') ? 1 : -1)),
            collapsible: true,
          },
        ]
      }
    }
  }, [view, tasks, filters, todayOpen, doneToday, today])

  useEffect(() => {
    setVisible(groups.flatMap((g) => g.tasks.map((t) => t.id)))
  }, [groups, setVisible])

  const totalOpen = groups.filter((g) => !g.collapsible).reduce((n, g) => n + g.tasks.length, 0)
  const isFiltered = !!(filters.query || filters.priorities.length || filters.tags.length || filters.energy)

  const meta = (() => {
    switch (view.kind) {
      case 'inbox':
        return { icon: <Inbox />, title: 'Inbox', sub: `${totalOpen} open · capture now, organise later` }
      case 'today':
        return {
          icon: <Sun />,
          title: 'Today',
          sub: `${format(now, 'EEEE, d MMMM')} · ${todayOpen.length} left · ${doneToday.length} done`,
        }
      case 'upcoming':
        return { icon: <CalendarRange />, title: 'Upcoming', sub: `${totalOpen} scheduled ahead` }
      case 'logbook':
        return { icon: <Archive />, title: 'Logbook', sub: `${tasks.filter((t) => t.status === 'done').length} completed all-time` }
      case 'project':
        return {
          icon: <span className="size-2.5 rounded-[3px]" style={{ background: project?.color, boxShadow: `0 0 10px ${project?.color}` }} />,
          title: project?.name ?? 'Project',
          sub: `${totalOpen} open · ${groups[1]?.tasks.length ?? 0} done`,
        }
    }
  })()

  const defaults: Partial<Task> | undefined =
    view.kind === 'today'
      ? { plannedFor: today }
      : view.kind === 'project'
        ? { projectId: view.id }
        : view.kind === 'upcoming'
          ? { due: addDaysKey(today, 1) }
          : undefined

  if (view.kind === 'project' && !project) {
    return <EmptyState art="folder" title="Project not found" body="It may have been deleted." />
  }

  const empty = groups.every((g) => g.tasks.length === 0)

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <ViewHeader
        icon={meta.icon}
        title={view.kind === 'project' && project ? <ProjectTitle id={project.id} name={project.name} /> : meta.title}
        sub={meta.sub}
        right={
          <>
            {view.kind === 'today' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Timer className="size-3.5" />}
                  onClick={() => startFocus(todayOpen[0]?.id ?? null)}
                >
                  Focus
                </Button>
                <Button size="sm" variant="secondary" icon={<Sunrise className="size-3.5" />} onClick={() => open('plan')} kbd="P">
                  Plan my day
                </Button>
              </>
            )}
            {view.kind === 'project' && project && <ProjectDelete id={project.id} name={project.name} />}
          </>
        }
      >
        {view.kind !== 'logbook' && <QuickAdd defaults={defaults} />}
        <FilterBar className="mt-3" />
      </ViewHeader>

      {empty ? (
        isFiltered ? (
          <EmptyState
            art="search"
            title="Nothing matches those filters"
            body="Try loosening a filter or clearing the search."
            action={
              <Button size="sm" onClick={() => useUI.getState().resetFilters()}>
                Clear filters
              </Button>
            }
          />
        ) : view.kind === 'today' ? (
          <EmptyState
            art="sun"
            title="A clear day ahead"
            body="Nothing on your plate yet. Pull a few tasks in with the morning ritual, or enjoy the space."
            action={
              <Button variant="primary" size="sm" onClick={() => open('plan')} icon={<Sunrise className="size-3.5" />}>
                Plan my day
              </Button>
            }
          />
        ) : view.kind === 'inbox' ? (
          <EmptyState art="inbox" title="Inbox zero" body="Everything has a home. Capture new thoughts with Q." />
        ) : view.kind === 'upcoming' ? (
          <EmptyState
            art="calendar"
            title="The horizon is clear"
            body="Nothing scheduled for the next two weeks. Add a date with words like “next fri”."
          />
        ) : view.kind === 'logbook' ? (
          <EmptyState
            art="archive"
            title="Your logbook awaits"
            body="Completed tasks land here, a quiet record of everything you’ve shipped."
          />
        ) : (
          <EmptyState art="folder" title="A fresh project" body="Add the first task above. Small steps compound." />
        )
      ) : (
        <div className="flex flex-col gap-6 pb-24">
          {groups.map((g, gi) =>
            g.tasks.length === 0 && (view.kind !== 'upcoming' || gi > 6) ? null : (
              <GroupBlock
                key={g.id}
                group={g}
                delay={gi * 0.04}
                showProject={view.kind !== 'project'}
                dim={view.kind === 'upcoming' && g.tasks.length === 0}
              />
            ),
          )}
          {view.kind === 'today' && todayOpen.length === 0 && doneToday.length > 0 && (
            <EmptyState
              compact
              art="sun"
              title="Today is clear"
              body="Every planned task is done. Shut down with intention, or pull something forward."
              action={
                <Button size="sm" onClick={() => open('shutdown')}>
                  Start shutdown
                </Button>
              }
            />
          )}
        </div>
      )}
    </div>
  )
}

function GroupBlock({ group, delay, showProject, dim }: { group: Group; delay: number; showProject: boolean; dim?: boolean }) {
  const [collapsed, setCollapsed] = useState(group.collapsible ?? false)
  if (group.tasks.length === 0 && group.collapsible) return null
  return (
    <section>
      <button
        type="button"
        onClick={() => group.collapsible && setCollapsed((c) => !c)}
        className="mb-1 flex w-full items-center gap-2 border-b border-line px-1 pb-2 text-left"
      >
        {group.collapsible && (
          <ChevronRight className={`size-3.5 text-faint transition-transform duration-200 ${collapsed ? '' : 'rotate-90'}`} />
        )}
        <span className={`text-[13px] font-semibold ${group.tone === 'danger' ? 'text-danger' : dim ? 'text-faint' : 'text-fg'}`}>
          {group.title}
        </span>
        {group.meta && <span className="tnum text-xs text-faint">{group.meta}</span>}
        <span className="tnum ml-auto text-xs text-faint">{group.tasks.length || ''}</span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.32, ease: EXPO_OUT } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            {group.tasks.length === 0 ? (
              <div className="px-3 py-2 text-xs text-faint/80">Nothing scheduled</div>
            ) : (
              <TaskList tasks={group.tasks} showProject={showProject} delay={delay} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function ProjectTitle({ id, name }: { id: string; name: string }) {
  const update = useStore((s) => s.updateProject)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  if (!editing)
    return (
      <span
        onDoubleClick={() => {
          setValue(name)
          setEditing(true)
        }} title="Double-click to rename" className="cursor-text">
        {name}
      </span>
    )
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) update(id, { name: value.trim() })
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setEditing(false)
      }}
      className="display w-full bg-transparent text-[22px] text-fg outline-none sm:text-[24px]"
    />
  )
}

function ProjectDelete({ id, name }: { id: string; name: string }) {
  const del = useStore((s) => s.deleteProject)
  const undo = useStore((s) => s.undo)
  const setView = useUI((s) => s.setView)
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<Trash2 className="size-3.5" />}
      onClick={() => {
        del(id)
        setView({ kind: 'inbox' })
        toast(`Deleted project “${name}”`, {
          description: 'Its tasks moved to the Inbox.',
          action: { label: 'Undo', onClick: () => undo() },
        })
      }}
    >
      Delete
    </Button>
  )
}
