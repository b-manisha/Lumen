import { useMemo, useState, type ReactNode } from 'react'
import { Command, defaultFilter } from 'cmdk'
import {
  Archive,
  ArrowLeft,
  CalendarRange,
  CircleCheck,
  Download,
  Grid2x2,
  Inbox,
  Keyboard,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Settings,
  SquareKanban,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Upload,
} from 'lucide-react'
import type { ViewId } from '../lib/types'
import { cn, compareTasks, dueLabel, isOpen } from '../lib/utils'
import { parseQuickAdd } from '../lib/parse'
import { completeTask, downloadExport, pickImport } from '../lib/actions'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from './Modal'
import { Kbd } from './ui'

type Page = 'root' | 'focus'

const COMMAND_WORDS = [
  'new task',
  'plan my day',
  'morning',
  'ritual',
  'start focus session',
  'focus',
  'pomodoro',
  'timer',
  'evening shutdown',
  'shutdown',
  'review',
  'switch to light theme',
  'switch to dark theme',
  'theme',
  'dark',
  'light',
  'appearance',
  'export backup',
  'export',
  'import backup',
  'import',
  'keyboard shortcuts',
  'shortcuts',
  'settings',
  'dashboard',
  'inbox',
  'today',
  'upcoming',
  'logbook',
  'completed',
  'eisenhower matrix',
  'matrix',
  'kanban board',
  'board',
]

export function CommandPalette() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  return (
    <Modal
      open={overlay === 'palette'}
      onClose={close}
      title="Command menu"
      hideHeader
      position="top"
      className="w-[min(640px,100%)]"
    >
      <PaletteBody />
    </Modal>
  )
}

function PaletteBody() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<Page>('root')
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const theme = useStore((s) => s.settings.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const addTask = useStore((s) => s.addTask)
  const addProject = useStore((s) => s.addProject)
  const { close, open, setView, startFocus, edit } = useUI.getState()

  const openTasks = useMemo(() => tasks.filter(isOpen).sort(compareTasks), [tasks])
  const parsed = useMemo(() => (search.trim() ? parseQuickAdd(search, projects) : null), [search, projects])

  const go = (v: ViewId) => {
    setView(v)
    close()
  }
  const run = (fn: () => void) => () => {
    close()
    fn()
  }

  // cmdk doesn't reorder groups reliably, so when the query clearly names a command
  // ("import", "theme", "inbox"…) list commands first and keep "Create task" below them.
  const q = search.trim().toLowerCase()
  const commandMatch =
    q.length > 1 &&
    [...COMMAND_WORDS, ...projects.map((p) => p.name.toLowerCase())].some((w) => w.startsWith(q) || w.includes(` ${q}`))

  const createGroup = parsed?.title && (
    <Command.Group heading="Create">
      <Command.Item
        value={`create ${search}`}
        onSelect={run(() => {
          const projectId = parsed.projectId ?? (parsed.newProjectName ? addProject(parsed.newProjectName) : null)
          addTask({
            title: parsed.title,
            due: parsed.due,
            dueTime: parsed.dueTime,
            priority: parsed.priority ?? 4,
            tags: parsed.tags,
            energy: parsed.energy,
            estimate: parsed.estimate,
            projectId,
            recurrence: parsed.recurrence,
          })
        })}
      >
        <Plus className="cmdk-icon size-4" />
        <span className="truncate">
          Create task <span className="text-fg">“{parsed.title}”</span>
        </span>
        <span className="ml-auto flex gap-1">
          {parsed.tokens.slice(0, 3).map((t) => (
            <span
              key={t.kind + t.label}
              className="rounded-chip border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-faint"
            >
              {t.label}
            </span>
          ))}
        </span>
      </Command.Item>
    </Command.Group>
  )

  return (
    <Command
      label="Command menu"
      loop
      filter={(value, search, keywords) => {
        // "Create task" always matches, but ranks below real commands and tasks
        if (value.startsWith('create ')) return 0.01
        return defaultFilter ? defaultFilter(value, search, keywords) : 1
      }}
      className="flex max-h-[min(520px,70vh)] flex-col"
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !search && page !== 'root') {
          e.preventDefault()
          setPage('root')
        }
      }}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        {page !== 'root' ? (
          <button
            onClick={() => setPage('root')}
            className="press inline-flex h-6 items-center gap-1 rounded-chip border border-line bg-surface-hover px-1.5 text-[11px] text-muted"
          >
            <ArrowLeft className="size-3" /> Focus
          </button>
        ) : (
          <Search className="size-4 text-faint" />
        )}
        <Command.Input
          autoFocus
          value={search}
          onValueChange={setSearch}
          placeholder={page === 'focus' ? 'Pick a task to focus on…' : 'Type a command, search tasks, or create one…'}
          className="h-full flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-faint"
        />
        <Kbd>Esc</Kbd>
      </div>

      <Command.List className="no-scrollbar flex-1 overflow-y-auto p-2 [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col">
        <Command.Empty>
          <div className="text-sm">No results for “{search}”</div>
        </Command.Empty>

        {page === 'root' && (
          <>
            {!commandMatch && createGroup}

            <Command.Group heading="Actions">
              <Item icon={<Plus />} label="New task" kbd="Q" onSelect={run(() => open('quickadd'))} />
              <Item
                icon={<Sunrise />}
                label="Plan my day"
                kbd="P"
                onSelect={run(() => open('plan'))}
                keywords={['morning', 'ritual']}
              />
              <Item
                icon={<Timer />}
                label="Start focus session…"
                kbd="F"
                onSelect={() => {
                  setSearch('')
                  setPage('focus')
                }}
                keywords={['pomodoro', 'timer']}
              />
              <Item
                icon={<Sunset />}
                label="Evening shutdown"
                kbd="⇧S"
                onSelect={run(() => open('shutdown'))}
                keywords={['review', 'end of day']}
              />
              <Item
                icon={theme === 'dark' ? <Sun /> : <Moon />}
                label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                kbd="⇧T"
                onSelect={run(toggleTheme)}
                keywords={['theme', 'dark', 'light', 'appearance']}
              />
              <Item icon={<Download />} label="Export backup (JSON)" onSelect={run(downloadExport)} />
              <Item icon={<Upload />} label="Import backup…" onSelect={run(pickImport)} />
              <Item icon={<Keyboard />} label="Keyboard shortcuts" kbd="?" onSelect={run(() => open('shortcuts'))} />
              <Item icon={<Settings />} label="Settings" onSelect={run(() => open('settings'))} />
            </Command.Group>

            <Command.Group heading="Navigate">
              <Item icon={<LayoutDashboard />} label="Dashboard" kbd="G D" onSelect={() => go({ kind: 'dashboard' })} />
              <Item icon={<Inbox />} label="Inbox" kbd="G I" onSelect={() => go({ kind: 'inbox' })} />
              <Item icon={<Sun />} label="Today" kbd="G T" onSelect={() => go({ kind: 'today' })} />
              <Item icon={<CalendarRange />} label="Upcoming" kbd="G U" onSelect={() => go({ kind: 'upcoming' })} />
              <Item
                icon={<Archive />}
                label="Logbook"
                kbd="G L"
                onSelect={() => go({ kind: 'logbook' })}
                keywords={['completed', 'done']}
              />
              <Item icon={<Grid2x2 />} label="Eisenhower matrix" kbd="G M" onSelect={() => go({ kind: 'matrix' })} />
              <Item icon={<SquareKanban />} label="Kanban board" kbd="G B" onSelect={() => go({ kind: 'board' })} />
              {projects.map((p) => (
                <Item
                  key={p.id}
                  icon={<span className="m-[3px] block size-2.5 rounded-[3px]" style={{ background: p.color }} />}
                  label={p.name}
                  hint="Project"
                  onSelect={() => go({ kind: 'project', id: p.id })}
                />
              ))}
            </Command.Group>

            {commandMatch && createGroup}

            {search.trim().length > 0 && (
              <Command.Group heading="Tasks">
                {openTasks.slice(0, 60).map((t) => (
                  <Command.Item key={t.id} value={`task ${t.title} ${t.tags.join(' ')} ${t.id}`} onSelect={run(() => edit(t.id))}>
                    <CircleCheck className="cmdk-icon size-4" />
                    <span className="truncate text-fg">{t.title}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2 text-[11.5px] text-faint">
                      {t.due && <span className="tnum">{dueLabel(t.due)}</span>}
                      <button
                        className="rounded-chip border border-line px-1.5 py-0.5 text-[10.5px] hover:text-fg"
                        onClick={(e) => {
                          e.stopPropagation()
                          close()
                          completeTask(t.id)
                        }}
                      >
                        Complete
                      </button>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}

        {page === 'focus' && (
          <Command.Group heading="Focus on">
            <Item icon={<Timer />} label="Free focus (no task)" onSelect={() => startFocus(null)} />
            {openTasks.slice(0, 80).map((t) => (
              <Command.Item key={t.id} value={`focus ${t.title} ${t.id}`} onSelect={() => startFocus(t.id)}>
                <Timer className="cmdk-icon size-4" />
                <span className="truncate text-fg">{t.title}</span>
                {t.due && <span className="tnum ml-auto text-[11.5px] text-faint">{dueLabel(t.due)}</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>

      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line px-4 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> select
        </span>
        <span className="ml-auto hidden items-center gap-1.5 sm:flex">
          Type <code className="font-mono text-muted">tomorrow #tag !high</code> to create
        </span>
      </div>
    </Command>
  )
}

function Item({
  icon,
  label,
  kbd,
  hint,
  onSelect,
  keywords,
}: {
  icon: ReactNode
  label: string
  kbd?: string
  hint?: string
  onSelect: () => void
  keywords?: string[]
}) {
  return (
    <Command.Item value={label} keywords={keywords} onSelect={onSelect}>
      <span className="cmdk-icon text-faint [&>svg]:size-4">{icon}</span>
      <span className="truncate">{label}</span>
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
      {kbd && (
        <span className={cn('ml-auto flex gap-1')}>
          {kbd.split(' ').map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </Command.Item>
  )
}
