import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Archive,
  CalendarRange,
  Command,
  Grid2x2,
  Inbox,
  LayoutDashboard,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  SquareKanban,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Users,
} from 'lucide-react'
import type { ViewId } from '../lib/types'
import { cn, isOpen, isToday, modKey, todayKey } from '../lib/utils'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { useNow } from '../hooks/useDerived'
import { Kbd, Tip } from './ui'

function sameView(a: ViewId, b: ViewId) {
  return a.kind === b.kind && (a.kind !== 'project' || (b.kind === 'project' && a.id === b.id))
}

export function Sidebar() {
  const collapsedSetting = useStore((s) => s.settings.sidebarCollapsed)
  const setSettings = useStore((s) => s.setSettings)
  const mobileNav = useUI((s) => s.mobileNav)
  const setMobileNav = useUI((s) => s.setMobileNav)

  return (
    <>
      {/* Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: collapsedSetting ? 56 : 240 }}
        transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        className="relative z-30 hidden h-full shrink-0 border-r border-line bg-[color-mix(in_srgb,var(--bg-elevated)_70%,transparent)] md:block"
      >
        <SidebarInner collapsed={collapsedSetting} onToggle={() => setSettings({ sidebarCollapsed: !collapsedSetting })} />
      </motion.aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNav && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[var(--scrim)] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNav(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[272px] border-r border-line bg-elevated shadow-[var(--shadow-pop)] md:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0, transition: { type: 'spring', stiffness: 420, damping: 40 } }}
              exit={{ x: -280, transition: { duration: 0.2 } }}
            >
              <SidebarInner collapsed={false} mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

function SidebarInner({ collapsed, onToggle, mobile }: { collapsed: boolean; onToggle?: () => void; mobile?: boolean }) {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const addProject = useStore((s) => s.addProject)
  const theme = useStore((s) => s.settings.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const open = useUI((s) => s.open)
  const startFocus = useUI((s) => s.startFocus)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const now = useNow()

  const counts = useMemo(() => {
    const today = todayKey()
    const openTasks = tasks.filter(isOpen)
    const byProject = new Map<string, number>()
    for (const t of openTasks) if (t.projectId) byProject.set(t.projectId, (byProject.get(t.projectId) ?? 0) + 1)
    return {
      inbox: openTasks.filter((t) => !t.projectId).length,
      today: openTasks.filter((t) => isToday(t, today)).length,
      overdue: openTasks.filter((t) => t.due && t.due < today).length,
      upcoming: openTasks.filter((t) => t.due && t.due > today).length,
      review: openTasks.filter((t) => t.agent?.status === 'review').length,
      byProject,
    }
  }, [tasks])

  const hour = now.getHours()

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between px-4')}>
        <div className="flex items-center gap-2.5">
          <Logo />
          {!collapsed && <div className="display text-[15px] tracking-[-0.02em] text-fg">Lumen</div>}
        </div>
        {!collapsed && onToggle && (
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="press inline-flex size-7 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg"
          >
            <PanelLeftClose className="size-4" />
          </button>
        )}
      </div>

      {/* Search / palette trigger */}
      <div className={cn('shrink-0', collapsed ? 'px-2' : 'px-3')}>
        {collapsed ? (
          <Tip content={`Command menu · ${modKey}K`} side="right">
            <button
              onClick={() => open('palette')}
              aria-label="Command menu"
              className="press mx-auto flex size-10 items-center justify-center rounded-ctl text-muted hover:bg-surface-hover hover:text-fg"
            >
              <Command className="size-4" />
            </button>
          </Tip>
        ) : (
          <button
            onClick={() => open('palette')}
            className="press flex h-8 w-full items-center gap-2 rounded-ctl border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-2.5 text-[12.5px] text-faint shadow-[inset_0_1px_0_var(--highlight)] hover:border-line-strong hover:text-muted"
          >
            <Command className="size-3.5" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <Kbd>{modKey}K</Kbd>
          </button>
        )}
      </div>

      <nav className={cn('no-scrollbar flex-1 overflow-y-auto pb-4', collapsed ? 'px-2' : 'px-3')}>
        <div className="mt-4 flex flex-col gap-0.5">
          <NavItem
            collapsed={collapsed}
            mobile={mobile}
            to={{ kind: 'dashboard' }}
            icon={<LayoutDashboard />}
            label="Dashboard"
            kbd="G D"
          />
          <NavItem
            collapsed={collapsed}
            mobile={mobile}
            to={{ kind: 'inbox' }}
            icon={<Inbox />}
            label="Inbox"
            count={counts.inbox}
            kbd="G I"
          />
          <NavItem
            collapsed={collapsed}
            mobile={mobile}
            to={{ kind: 'today' }}
            icon={<Sun />}
            label="Today"
            count={counts.today}
            kbd="G T"
            danger={counts.overdue > 0}
          />
          <NavItem
            collapsed={collapsed}
            mobile={mobile}
            to={{ kind: 'upcoming' }}
            icon={<CalendarRange />}
            label="Upcoming"
            count={counts.upcoming}
            kbd="G U"
          />
          <NavItem collapsed={collapsed} mobile={mobile} to={{ kind: 'logbook' }} icon={<Archive />} label="Logbook" kbd="G L" />
        </div>

        <NavSection collapsed={collapsed} title="Views">
          <NavItem collapsed={collapsed} mobile={mobile} to={{ kind: 'matrix' }} icon={<Grid2x2 />} label="Eisenhower" kbd="G M" />
          <NavItem collapsed={collapsed} mobile={mobile} to={{ kind: 'board' }} icon={<SquareKanban />} label="Board" kbd="G B" />
          <NavItem
            collapsed={collapsed}
            mobile={mobile}
            to={{ kind: 'delegation' }}
            icon={<Users />}
            label="Delegation"
            count={counts.review}
            kbd="G A"
            accent
          />
        </NavSection>

        <NavSection collapsed={collapsed} title="Rituals">
          {(
            [
              { icon: <Sunrise />, label: 'Plan my day', on: () => open('plan'), hint: hour < 12, kbd: 'P' },
              { icon: <Timer />, label: 'Focus session', on: () => startFocus(null), kbd: 'F' },
              { icon: <Sunset />, label: 'Shutdown', on: () => open('shutdown'), hint: hour >= 17, kbd: '⇧S' },
            ] as const
          ).map((r) => {
            const btn = (
              <button
                key={r.label}
                onClick={r.on}
                className={cn(
                  'press group/nav relative flex h-8 w-full items-center gap-2.5 rounded-ctl text-[13px] font-medium text-muted hover:bg-surface-hover hover:text-fg',
                  collapsed ? 'justify-center' : 'px-2.5',
                )}
              >
                <span className="text-faint group-hover/nav:text-muted [&>svg]:size-[16px]">{r.icon}</span>
                {!collapsed && <span className="flex-1 text-left">{r.label}</span>}
                {!collapsed && 'hint' in r && r.hint && <span className="pulse-dot size-1.5 rounded-full bg-accent" />}
                {!collapsed && !('hint' in r && r.hint) && (
                  <span className="opacity-0 transition-opacity group-hover/nav:opacity-100">
                    <Kbd>{r.kbd}</Kbd>
                  </span>
                )}
              </button>
            )
            return collapsed ? (
              <Tip key={r.label} content={r.label} side="right">
                {btn}
              </Tip>
            ) : (
              btn
            )
          })}
        </NavSection>

        <NavSection
          collapsed={collapsed}
          title="Projects"
          action={
            <button
              onClick={() => setAdding(true)}
              aria-label="New project"
              className="press inline-flex size-5 items-center justify-center rounded-[4px] text-faint hover:bg-surface-hover hover:text-fg"
            >
              <Plus className="size-3.5" />
            </button>
          }
        >
          {projects.map((p) => {
            const active = view.kind === 'project' && view.id === p.id
            const count = counts.byProject.get(p.id) ?? 0
            const btn = (
              <button
                key={p.id}
                onClick={() => setView({ kind: 'project', id: p.id })}
                className={cn(
                  'press relative flex h-8 w-full items-center gap-2.5 rounded-ctl text-[13px] font-medium transition-colors',
                  collapsed ? 'justify-center' : 'px-2.5',
                  active ? 'text-fg' : 'text-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                {active && (
                  <motion.span
                    layoutId={mobile ? 'nav-active-m' : 'nav-active'}
                    className="absolute inset-0 rounded-ctl bg-surface-hover shadow-[inset_0_1px_0_var(--highlight),0_0_0_1px_var(--border)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative flex size-4 items-center justify-center">
                  <span
                    className="size-2 rounded-[3px]"
                    style={{ background: p.color, boxShadow: active ? `0 0 10px ${p.color}` : undefined }}
                  />
                </span>
                {!collapsed && <span className="relative flex-1 truncate text-left">{p.name}</span>}
                {!collapsed && count > 0 && <span className="tnum relative text-[11.5px] text-faint">{count}</span>}
              </button>
            )
            return collapsed ? (
              <Tip key={p.id} content={p.name} side="right">
                {btn}
              </Tip>
            ) : (
              btn
            )
          })}
          {adding && !collapsed && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) {
                  const id = addProject(name)
                  setView({ kind: 'project', id })
                }
                setName('')
                setAdding(false)
              }}
              className="px-1"
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  setAdding(false)
                  setName('')
                }}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
                placeholder="Project name"
                className="h-8 w-full rounded-ctl border border-[rgba(var(--accent-rgb),0.5)] bg-transparent px-2 text-[13px] text-fg outline-none shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.12)]"
              />
            </form>
          )}
          {projects.length === 0 && !adding && !collapsed && (
            <button onClick={() => setAdding(true)} className="px-2.5 py-1 text-left text-xs text-faint hover:text-muted">
              + Create your first project
            </button>
          )}
        </NavSection>
      </nav>

      {/* Footer */}
      <div className={cn('flex shrink-0 items-center border-t border-line py-2', collapsed ? 'flex-col gap-1 px-2' : 'gap-1 px-3')}>
        <Tip content="Settings" side={collapsed ? 'right' : 'top'}>
          <button
            onClick={() => open('settings')}
            aria-label="Settings"
            className="press inline-flex size-8 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg"
          >
            <Settings className="size-4" />
          </button>
        </Tip>
        <Tip content={`Switch to ${theme === 'dark' ? 'light' : 'dark'} · ⇧T`} side={collapsed ? 'right' : 'top'}>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="press relative inline-flex size-8 items-center justify-center overflow-hidden rounded-ctl text-faint hover:bg-surface-hover hover:text-fg"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </Tip>
        {!collapsed && (
          <button
            onClick={() => open('shortcuts')}
            className="press ml-auto inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-[11.5px] text-faint hover:bg-surface-hover hover:text-muted"
          >
            <Kbd>?</Kbd> Shortcuts
          </button>
        )}
        {collapsed && onToggle && (
          <Tip content="Expand sidebar" side="right">
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="press inline-flex size-8 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </Tip>
        )}
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  count,
  kbd,
  danger,
  accent,
  collapsed,
  mobile,
}: {
  to: ViewId
  icon: ReactNode
  label: string
  count?: number
  kbd?: string
  danger?: boolean
  /** count rendered as an accent pill (e.g. agent outputs awaiting review) */
  accent?: boolean
  collapsed: boolean
  mobile?: boolean
}) {
  const view = useUI((s) => s.view)
  const setView = useUI((s) => s.setView)
  const active = sameView(view, to)
  const btn = (
    <button
      onClick={() => setView(to)}
      className={cn(
        'press group/nav relative flex h-8 w-full items-center gap-2.5 rounded-ctl text-[13px] font-medium transition-colors',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        active ? 'text-fg' : 'text-muted hover:bg-surface-hover hover:text-fg',
      )}
    >
      {active && (
        <motion.span
          layoutId={mobile ? 'nav-active-m' : 'nav-active'}
          className="absolute inset-0 rounded-ctl bg-surface-hover shadow-[inset_0_1px_0_var(--highlight),0_0_0_1px_var(--border)]"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <span className={cn('relative [&>svg]:size-[16px]', active ? 'text-accent' : 'text-faint group-hover/nav:text-muted')}>{icon}</span>
      {!collapsed && <span className="relative flex-1 truncate text-left">{label}</span>}
      {!collapsed && count != null && count > 0 && (
        <span
          className={cn(
            'tnum relative text-[11.5px]',
            danger ? 'text-danger' : accent ? 'rounded-full bg-accent-soft px-1.5 font-medium text-accent' : 'text-faint',
          )}
          title={accent ? `${count} ready for review` : undefined}
        >
          {count}
        </span>
      )}
      {!collapsed && kbd && !count && (
        <span className="relative opacity-0 transition-opacity group-hover/nav:opacity-100">
          <Kbd>{kbd}</Kbd>
        </span>
      )}
      {collapsed && count != null && count > 0 && (
        <span className={cn('absolute top-1 right-1.5 size-1.5 rounded-full', danger ? 'bg-danger' : 'bg-accent')} />
      )}
    </button>
  )
  return collapsed ? (
    <Tip content={label} side="right">
      {btn}
    </Tip>
  ) : (
    btn
  )
}

function NavSection({
  children,
  title,
  action,
  collapsed,
}: {
  children: ReactNode
  title: string
  action?: ReactNode
  collapsed: boolean
}) {
  return (
    <div className="mt-5">
      {!collapsed ? (
        <div className="mb-1 flex h-6 items-center justify-between px-2.5 text-[11px] font-medium tracking-wide text-faint">
          {title}
          {action}
        </div>
      ) : (
        <div className="mx-auto mb-2 h-px w-6 bg-line" />
      )}
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-[8px] border border-line-strong bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.25),rgba(var(--accent-rgb),0.06))] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_18px_-6px_rgba(var(--accent-rgb),0.8)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <circle cx="12" cy="12" r="8" stroke="var(--accent)" strokeOpacity=".35" strokeWidth="2.2" />
        <path d="M12 4a8 8 0 0 1 7.6 10.5" stroke="var(--accent-hover)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="m8.4 12.2 2.5 2.5 4.8-5.2" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
