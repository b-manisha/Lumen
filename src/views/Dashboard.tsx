import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { format } from 'date-fns'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarRange,
  CheckCheck,
  Command,
  Flame,
  Moon,
  PieChart,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Timer,
} from 'lucide-react'
import {
  addDaysKey,
  cn,
  compareTasks,
  dueLabel,
  formatMinutes,
  formatTime,
  fromKey,
  greeting,
  isOpen,
  modKey,
  todayKey,
} from '../lib/utils'
import { computeStreak, focusSeries, heatmapGrid, projectBreakdown, tagBreakdown, weeklyBars } from '../lib/stats'
import { EXPO_OUT } from '../lib/motion'
import { useDayGetter, useNow, useTodayTasks } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Card, CardHeader, Button, Kbd, Segmented, Tip } from '../components/ui'
import { ProgressRing } from '../components/ProgressRing'
import { CountUp } from '../components/CountUp'
import { Sparkline } from '../components/Sparkline'
import { TaskList } from '../components/TaskList'
import { Heatmap, HeatLegend } from '../components/Heatmap'
import { Breakdown } from '../components/Breakdown'
import { EmptyState } from '../components/EmptyState'
import { QuickAdd } from '../components/QuickAdd'
import { MobileMenuButton } from '../components/ViewHeader'
import { DelegationWidget } from '../components/DelegationWidget'

// recharts is heavy; load it in its own chunk
const WeeklyChart = lazy(() => import('../components/WeeklyChart').then((m) => ({ default: m.WeeklyChart })))

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EXPO_OUT } } }

function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  )
}

export function Dashboard() {
  const now = useNow()
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const name = useStore((s) => s.settings.name)
  const theme = useStore((s) => s.settings.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const lastPlanned = useStore((s) => s.lastPlanned)
  const lastShutdown = useStore((s) => s.lastShutdown)
  const { open: openUI, setView, startFocus, setVisible } = useUI.getState()
  const get = useDayGetter()
  const { open: todayOpen, doneToday } = useTodayTasks()
  const today = todayKey()

  const streak = useMemo(() => computeStreak(get), [get])
  const focus = useMemo(() => focusSeries(get, 14), [get])
  const week = useMemo(() => weeklyBars(get, tasks), [get, tasks])
  const heat = useMemo(() => heatmapGrid(get), [get])
  const overdue = useMemo(() => tasks.filter((t) => isOpen(t) && t.due && t.due < today).sort(compareTasks), [tasks, today])
  const [breakdownMode, setBreakdownMode] = useState<'projects' | 'tags'>('projects')
  const breakdown = useMemo(
    () => (breakdownMode === 'projects' ? projectBreakdown(tasks, projects) : tagBreakdown(tasks)),
    [breakdownMode, tasks, projects],
  )

  const focusList = useMemo(() => [...todayOpen].sort((a, b) => a.priority - b.priority || compareTasks(a, b)), [todayOpen])
  const frogs = focusList.slice(0, 3)
  const rest = focusList.slice(3)
  useEffect(() => setVisible(focusList.map((t) => t.id)), [focusList, setVisible])

  const upcoming = useMemo(() => {
    const out: { key: string; tasks: typeof tasks }[] = []
    for (let i = 1; i <= 7; i++) {
      const k = addDaysKey(today, i)
      const list = tasks.filter((t) => isOpen(t) && t.due === k).sort(compareTasks)
      if (list.length) out.push({ key: k, tasks: list })
    }
    return out
  }, [tasks, today])

  const upcomingCount = upcoming.reduce((n, d) => n + d.tasks.length, 0)
  const upcomingMinutes = upcoming.reduce((n, d) => n + d.tasks.reduce((m, t) => m + (t.estimate ?? 0), 0), 0)
  const totalToday = todayOpen.length + doneToday.length
  const estLeft = todayOpen.reduce((n, t) => n + (t.estimate ?? 0), 0)
  const focusToday = get(today).focus
  const focusAvg = Math.round(focus.slice(-7).reduce((a, b) => a + b, 0) / 7)
  const weekDone = week.reduce((n, d) => n + d.completed, 0)
  const weekPlanned = week.reduce((n, d) => n + d.planned, 0)
  const lastWeekDone = useMemo(() => {
    let n = 0
    for (let i = 7; i < 14; i++) n += get(addDaysKey(today, -i)).done
    return n
  }, [get, today])
  const delta = lastWeekDone ? Math.round(((weekDone - lastWeekDone) / lastWeekDone) * 100) : 0
  const hour = now.getHours()
  const ritual =
    hour < 14 && lastPlanned !== today
      ? {
          kind: 'plan' as const,
          icon: <Sunrise className="size-4" />,
          title: 'Start with intention',
          body: 'Two minutes to choose what matters today.',
          cta: 'Plan my day',
        }
      : hour >= 17 && lastShutdown !== today
        ? {
            kind: 'shutdown' as const,
            icon: <Sunset className="size-4" />,
            title: 'Close the loop',
            body: 'Review today, roll over the rest, and log off clean.',
            cta: 'Start shutdown',
          }
        : null

  return (
    <div className="mx-auto w-full max-w-[1280px] pb-16">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EXPO_OUT }}
        className="mb-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="pt-1">
              <MobileMenuButton />
            </div>
            <div className="min-w-0">
              <div className="tnum mb-1.5 flex items-center gap-2 text-xs font-medium text-faint">
                <span className="relative flex size-1.5">
                  <span className="pulse-dot absolute inset-0 rounded-full bg-success" />
                </span>
                {format(now, 'EEEE d MMMM')} · {format(now, 'HH:mm')}
              </div>
              <h1 className="display text-gradient text-[28px] sm:text-[32px]">
                {greeting(now)}
                {name ? `, ${name}` : ''}.
              </h1>
              <p className="mt-1.5 text-[13px] text-pretty text-muted">
                {todayOpen.length === 0 && doneToday.length > 0
                  ? 'Everything on today’s list is done. Beautiful.'
                  : todayOpen.length === 0
                    ? 'Your day is a blank canvas.'
                    : `${todayOpen.length} task${todayOpen.length === 1 ? '' : 's'} on deck${estLeft ? `, about ${formatMinutes(estLeft)} of work` : ''}${overdue.length ? ` · ${overdue.length} overdue` : ''}.`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => openUI('palette')}
              className="press hidden h-8 items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 text-xs text-muted shadow-[inset_0_1px_0_var(--highlight)] hover:border-line-strong hover:text-fg sm:inline-flex"
            >
              <Command className="size-3.5" /> Command
              <Kbd>{modKey}K</Kbd>
            </button>
            <Tip content={`Toggle theme · ⇧T`}>
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="press inline-flex size-8 items-center justify-center rounded-ctl border border-line bg-surface text-muted shadow-[inset_0_1px_0_var(--highlight)] hover:border-line-strong hover:text-fg"
              >
                {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
              </button>
            </Tip>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-12">
          <div className={ritual ? 'lg:col-span-8' : 'lg:col-span-12'}>
            <QuickAdd defaults={{ plannedFor: today }} />
          </div>
          {ritual && (
            <motion.button
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EXPO_OUT, delay: 0.2 }}
              onClick={() => openUI(ritual.kind)}
              className="press group/rit relative flex h-11 items-center gap-3 overflow-hidden rounded-row border border-[rgba(var(--accent-rgb),0.3)] bg-[linear-gradient(100deg,rgba(var(--accent-rgb),0.16),rgba(var(--accent-rgb),0.04))] px-3.5 text-left lg:col-span-4"
            >
              <span className="text-accent">{ritual.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg lg:hidden xl:block">{ritual.title}</span>
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-accent">
                {ritual.cta} <ArrowRight className="size-3.5 transition-transform group-hover/rit:translate-x-0.5" />
              </span>
            </motion.button>
          )}
        </div>
      </motion.header>

      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-12 gap-3 sm:gap-4">
        {/* ── KPI row ──
             Phones: a compact 2×2 grid (smaller numbers, tighter padding, secondary detail hidden)
             so the task list is reachable without a long scroll. sm+: the full tiles. */}
        <Tile className="col-span-6 xl:col-span-3">
          <Card className="@container flex h-full flex-col justify-start p-3.5 sm:justify-between sm:p-5">
            <div className="flex min-h-6 items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-faint sm:gap-2 sm:text-xs">
                <Target className="size-3.5" /> <span className="sm:hidden">Progress</span>
                <span className="hidden sm:inline">Today’s progress</span>
              </div>
              {todayOpen.length > 0 && estLeft > 0 && (
                <span className="tnum hidden text-[11px] whitespace-nowrap text-faint @[220px]:inline">~{formatMinutes(estLeft)} left</span>
              )}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3 sm:mt-3">
              <div className="min-w-0">
                <div className="display tnum text-[28px] leading-none text-fg sm:text-[40px]">
                  <CountUp value={doneToday.length} />
                  <span className="ml-1 text-[15px] text-faint sm:text-[20px]">/ {totalToday}</span>
                </div>
                <div className="mt-1.5 text-[11px] whitespace-nowrap text-muted sm:mt-2 sm:text-xs">
                  {totalToday === 0
                    ? 'Nothing planned yet'
                    : todayOpen.length === 0
                      ? 'All done. Take a bow.'
                      : `${todayOpen.length} ${todayOpen.length === 1 ? 'task' : 'tasks'} to go`}
                </div>
              </div>
              <div className="-my-3 -mr-1 hidden sm:block">
                <ProgressRing value={doneToday.length} total={totalToday} size={76} stroke={6} />
              </div>
            </div>
            {/* Phone: a hairline progress bar stands in for the ring. */}
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] sm:hidden">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-hover),var(--accent))] shadow-[0_0_8px_-1px_rgba(var(--accent-rgb),0.8)]"
                initial={{ width: 0 }}
                animate={{ width: `${totalToday ? Math.min(100, (doneToday.length / totalToday) * 100) : 0}%` }}
                transition={{ duration: 0.9, ease: EXPO_OUT, delay: 0.15 }}
              />
            </div>
          </Card>
        </Tile>

        <Tile className="col-span-6 xl:col-span-3">
          <Card className="@container flex h-full flex-col justify-start p-3.5 sm:justify-between sm:p-5">
            <div className="flex min-h-6 items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-faint sm:gap-2 sm:text-xs">
                <Timer className="size-3.5" /> <span className="sm:hidden">Focus</span>
                <span className="hidden sm:inline">Focus today</span>
              </div>
              <button
                onClick={() => startFocus(frogs[0]?.id ?? null)}
                className="press inline-flex h-6 items-center gap-1 rounded-chip border border-line px-1.5 text-[11px] text-muted hover:border-[rgba(var(--accent-rgb),0.5)] hover:text-accent"
              >
                Start <Kbd className="hidden h-4 min-w-4 text-[10px] sm:inline-flex">F</Kbd>
              </button>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-3 sm:mt-3">
              <div>
                <div className="display tnum text-[28px] leading-none text-fg sm:text-[40px]">
                  <CountUp value={focusToday} />
                  <span className="ml-1 text-[13px] text-faint sm:text-[15px]">min</span>
                </div>
                <div className="tnum mt-1.5 text-[11px] whitespace-nowrap text-muted sm:mt-2 sm:text-xs">
                  <span className="sm:hidden">avg</span>
                  <span className="hidden sm:inline">7-day avg</span>{' '}
                  <span className="text-fg">{formatMinutes(focusAvg)}</span>
                </div>
              </div>
              <div className="hidden @[230px]:block">
                <Sparkline data={focus} width={104} height={40} />
              </div>
              {/* Mid-width tiles (tablet) are too narrow for the 104px sparkline, which used to leave a hole on
                  the right. A compact 7-day bar chart takes its place so the tile stays balanced. Hidden on phones. */}
              <div className="mb-0.5 hidden h-10 shrink-0 items-end gap-[3px] sm:flex @[230px]:hidden" aria-hidden>
                {focus.slice(-7).map((m, i, arr) => {
                  const max = Math.max(1, ...arr)
                  const isToday = i === arr.length - 1
                  return (
                    <span
                      key={i}
                      className={cn(
                        'w-[5px] rounded-full',
                        m > 0 ? (isToday ? 'bg-accent' : 'bg-[rgba(var(--accent-rgb),0.55)]') : 'bg-[color-mix(in_srgb,var(--text)_8%,transparent)]',
                      )}
                      style={{
                        height: `${Math.max(5, Math.round((m / max) * 40))}px`,
                        boxShadow: isToday && m > 0 ? '0 0 8px -1px rgba(var(--accent-rgb),0.8)' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </Card>
        </Tile>

        <Tile className="col-span-6 xl:col-span-3">
          <Card className="flex h-full flex-col justify-start p-3.5 sm:justify-between sm:p-5">
            <div className="flex min-h-6 items-center gap-1.5 text-[11px] font-medium whitespace-nowrap text-faint sm:gap-2 sm:text-xs">
              <Flame className="size-3.5" /> <span className="sm:hidden">Streak</span>
              <span className="hidden sm:inline">Current streak</span>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-3 sm:mt-3">
              <div className="flex items-end gap-2 sm:gap-3">
                <div className="relative">
                  <div
                    className="absolute inset-0 -z-10 rounded-full blur-xl"
                    style={{
                      background: streak.current > 0 ? 'radial-gradient(closest-side, rgba(245,183,72,0.55), transparent)' : 'none',
                    }}
                  />
                  <Flame
                    className={cn('size-6 sm:size-9', streak.current > 0 ? 'text-warning' : 'text-faint')}
                    style={streak.current > 0 ? { fill: 'color-mix(in srgb, var(--warning) 35%, transparent)' } : undefined}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="display tnum text-[28px] leading-none text-fg sm:text-[40px]">
                  <CountUp value={streak.current} />
                  <span className="ml-1 text-[13px] text-faint sm:text-[15px]">{streak.current === 1 ? 'day' : 'days'}</span>
                </div>
              </div>
            </div>
            <div className="tnum mt-1.5 text-[11px] whitespace-nowrap text-muted sm:hidden">
              Best <span className="text-fg">{streak.best}</span>
            </div>
            <div className="mt-3 hidden items-center justify-between gap-3 sm:flex">
              <div className="flex min-w-0 flex-1 gap-1">
                {Array.from({ length: 7 }, (_, i) => {
                  const k = addDaysKey(today, i - 6)
                  const on = get(k).done > 0
                  return (
                    <Tip key={k} content={`${format(fromKey(k), 'EEE d MMM')} · ${get(k).done} done`}>
                      <span
                        className={cn(
                          'h-1.5 max-w-4 min-w-1.5 flex-1 rounded-full transition-colors',
                          on ? 'bg-warning' : 'bg-[color-mix(in_srgb,var(--text)_8%,transparent)]',
                        )}
                        style={on ? { boxShadow: '0 0 8px -1px rgba(245,183,72,0.7)' } : undefined}
                      />
                    </Tip>
                  )
                })}
              </div>
              <div className="tnum shrink-0 text-xs whitespace-nowrap text-muted">
                Best <span className="text-fg">{streak.best}</span>
              </div>
            </div>
          </Card>
        </Tile>

        <Tile className="col-span-6 xl:col-span-3">
          <Card
            className={cn(
              'flex h-full flex-col justify-start p-3.5 sm:justify-between sm:p-5',
              overdue.length > 0 && 'border-[color-mix(in_srgb,var(--danger)_30%,transparent)]',
            )}
            style={
              overdue.length > 0
                ? {
                    background:
                      'linear-gradient(180deg, color-mix(in srgb, var(--danger) 9%, transparent), transparent 70%), var(--surface)',
                  }
                : undefined
            }
          >
            <div className="flex min-h-6 items-center justify-between gap-2">
              <div
                className={cn(
                  'flex items-center gap-1.5 text-[11px] font-medium sm:gap-2 sm:text-xs',
                  overdue.length ? 'text-danger' : 'text-faint',
                )}
              >
                <AlertTriangle className="size-3.5" /> Overdue
              </div>
              {overdue.length > 0 && (
                <button
                  onClick={() => setView({ kind: 'today' })}
                  className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg"
                >
                  Review <ArrowRight className="size-3" />
                </button>
              )}
            </div>
            <div className="mt-2.5 flex items-end gap-2 sm:mt-3">
              <div className={cn('display tnum text-[28px] leading-none sm:text-[40px]', overdue.length ? 'text-danger' : 'text-fg')}>
                <CountUp value={overdue.length} />
              </div>
              {overdue.length === 0 && (
                <span className="mb-0.5 hidden items-center gap-1 text-xs text-success sm:mb-1 sm:inline-flex">
                  <CheckCheck className="size-3.5" /> All caught up
                </span>
              )}
            </div>
            <div className="mt-1.5 truncate text-[11px] text-muted sm:mt-3 sm:text-xs">
              {overdue.length ? (
                <>
                  <span className="sm:hidden">{overdue.length === 1 ? 'task' : 'tasks'} slipping</span>
                  <span className="hidden sm:inline">
                    Oldest: <span className="text-fg">{overdue[0].title}</span>{' '}
                    <span className="text-danger">· {dueLabel(overdue[0].due!)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1 text-success sm:hidden">
                    <CheckCheck className="size-3" /> All caught up
                  </span>
                  <span className="hidden sm:inline">Nothing slipping through the cracks.</span>
                </>
              )}
            </div>
          </Card>
        </Tile>

        {/* ── Row 2 ── */}
        <Tile className="col-span-12 lg:col-span-7">
          <Card className="h-full p-5">
            <CardHeader
              icon={<Target />}
              title="Today’s focus"
              sub={todayOpen.length ? 'Eat the frogs first: your three most important tasks.' : undefined}
              subClassName="hidden sm:block"
              right={
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setView({ kind: 'today' })}>
                    View all
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Sunrise className="size-3.5" />} onClick={() => openUI('plan')}>
                    Plan
                  </Button>
                </div>
              }
            />
            {focusList.length === 0 ? (
              <EmptyState
                compact
                art="sun"
                title={doneToday.length ? 'Today is clear' : 'Nothing planned yet'}
                body={
                  doneToday.length
                    ? `You finished ${doneToday.length} task${doneToday.length === 1 ? '' : 's'}. Enjoy the rest of your day.`
                    : 'Run the morning ritual to pick a realistic list.'
                }
                action={
                  !doneToday.length && (
                    <Button size="sm" variant="primary" onClick={() => openUI('plan')} icon={<Sunrise className="size-3.5" />}>
                      Plan my day
                    </Button>
                  )
                }
              />
            ) : (
              <div className="-mx-2">
                <div className="relative">
                  <div className="absolute top-0 bottom-0 left-[-2px] hidden w-px bg-[linear-gradient(180deg,transparent,rgba(var(--accent-rgb),0.6),transparent)] sm:block" />
                  <TaskList tasks={frogs} delay={0.3} />
                </div>
                {rest.length > 0 && (
                  <>
                    <div className="mx-3 mt-3 mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wide text-faint uppercase">
                      Also today <span className="h-px flex-1 bg-line" /> <span className="tnum">{rest.length}</span>
                    </div>
                    <TaskList tasks={rest.slice(0, 6)} compact delay={0.4} />
                    {rest.length > 6 && (
                      <button onClick={() => setView({ kind: 'today' })} className="mx-3 mt-1 text-xs text-faint hover:text-muted">
                        + {rest.length - 6} more
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </Tile>

        <Tile className="col-span-12 lg:col-span-5">
          <Card className="flex h-full flex-col p-5">
            <CardHeader
              icon={<CalendarRange />}
              title="Next 7 days"
              right={
                <Button size="sm" variant="ghost" onClick={() => setView({ kind: 'upcoming' })}>
                  Upcoming <ArrowRight className="size-3" />
                </Button>
              }
            />
            {upcoming.length === 0 ? (
              <EmptyState
                compact
                art="calendar"
                title="A quiet week ahead"
                body="Nothing scheduled. Type “next fri” in quick add to plan ahead."
              />
            ) : (
              <div className="mb-4 flex flex-col gap-3">
                {upcoming.slice(0, 7).map((d, i) => {
                  const date = fromKey(d.key)
                  return (
                    <motion.div
                      key={d.key}
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: EXPO_OUT, delay: 0.35 + i * 0.05 }}
                      className="flex gap-3"
                    >
                      <div className="flex w-11 shrink-0 flex-col items-center rounded-row border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] py-1.5 shadow-[inset_0_1px_0_var(--highlight)]">
                        <span className="text-[10px] font-medium tracking-wide text-faint uppercase">{format(date, 'EEE')}</span>
                        <span className="display tnum text-[17px] text-fg">{format(date, 'd')}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                        {d.tasks.slice(0, 3).map((t) => {
                          const proj = projects.find((p) => p.id === t.projectId)
                          return (
                            <button
                              key={t.id}
                              onClick={() => useUI.getState().edit(t.id)}
                              className="group/up flex min-w-0 items-center gap-2 rounded-[5px] text-left text-[12.5px]"
                            >
                              <span className="size-1.5 shrink-0 rounded-full" style={{ background: proj?.color ?? 'var(--text-faint)' }} />
                              <span className="truncate text-muted group-hover/up:text-fg">{t.title}</span>
                              {t.dueTime && <span className="tnum shrink-0 text-[11px] text-faint">{formatTime(t.dueTime)}</span>}
                              {t.priority === 1 && <span className="size-1 shrink-0 rounded-full bg-p1" />}
                            </button>
                          )
                        })}
                        {d.tasks.length > 3 && <span className="text-[11px] text-faint">+{d.tasks.length - 3} more</span>}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="tnum mt-auto flex items-center justify-between border-t border-line pt-3 text-[11px] text-faint">
                <span>
                  {upcomingCount} task{upcomingCount === 1 ? '' : 's'} across {upcoming.length} day{upcoming.length === 1 ? '' : 's'}
                </span>
                {upcomingMinutes > 0 && <span>~{formatMinutes(upcomingMinutes)} estimated</span>}
              </div>
            )}
          </Card>
        </Tile>

        {/* ── Row 3 ── */}
        <Tile className="col-span-12 lg:col-span-7">
          <Card className="h-full p-5">
            <CardHeader
              icon={<BarChart3 />}
              title="This week"
              sub="Completed vs planned, last 7 days"
              right={
                <div className="flex items-center gap-4 text-xs whitespace-nowrap">
                  <div className="text-right">
                    <div className="display tnum text-[18px] text-fg">{weekDone}</div>
                    <div className="text-faint">done</div>
                  </div>
                  <div className="text-right">
                    <div className="display tnum text-[18px] text-fg">{weekPlanned ? Math.round((weekDone / weekPlanned) * 100) : 0}%</div>
                    <div className="text-faint">follow-through</div>
                  </div>
                  {lastWeekDone > 0 && (
                    <div
                      className={cn(
                        'tnum hidden self-start rounded-chip px-1.5 py-0.5 text-[11px] font-medium sm:block',
                        delta >= 0
                          ? 'bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-success'
                          : 'bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger',
                      )}
                    >
                      {delta >= 0 ? '+' : ''}
                      {delta}% wk/wk
                    </div>
                  )}
                </div>
              }
            />
            <Suspense fallback={<div className="h-[208px] animate-pulse rounded-row bg-[color-mix(in_srgb,var(--text)_3%,transparent)]" />}>
              <WeeklyChart data={week} />
            </Suspense>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-accent" /> Completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] border border-line-strong bg-surface-hover" /> Planned
              </span>
            </div>
          </Card>
        </Tile>

        <Tile className="col-span-12 lg:col-span-5">
          <Card className="h-full p-5">
            <CardHeader
              icon={<PieChart />}
              title="Where the work goes"
              right={
                <Segmented
                  size="sm"
                  value={breakdownMode}
                  onChange={setBreakdownMode}
                  options={[
                    { value: 'projects', label: 'Projects' },
                    { value: 'tags', label: 'Tags' },
                  ]}
                />
              }
            />
            {breakdown.length === 0 ? (
              <EmptyState compact art="folder" title="No data yet" body="Add tasks to projects or tag them with #words to see the split." />
            ) : (
              <Breakdown
                key={breakdownMode}
                rows={breakdown}
                onSelect={(id) => {
                  if (breakdownMode === 'projects') setView(id === '__inbox' ? { kind: 'inbox' } : { kind: 'project', id })
                  else {
                    useUI.getState().setFilters({ tags: [id] })
                    setView({ kind: 'board' })
                  }
                }}
              />
            )}
          </Card>
        </Tile>

        {/* ── Row 4: Delegation ── */}
        <Tile className="col-span-12">
          <DelegationWidget />
        </Tile>

        {/* ── Row 5: Heatmap ── */}
        <Tile className="col-span-12">
          <Card className="p-5">
            <CardHeader
              icon={<Flame />}
              title="A year of momentum"
              sub={
                <span className="tnum">
                  {heat.total.toLocaleString()} task{heat.total === 1 ? '' : 's'} completed · {heat.activeDays} active day
                  {heat.activeDays === 1 ? '' : 's'} · best streak {streak.best} day{streak.best === 1 ? '' : 's'}
                </span>
              }
              right={<HeatLegend className="hidden sm:flex" />}
            />
            <div className="relative">
              <Heatmap weeks={heat.weeks} />
              {heat.total === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="glass rounded-row border border-line px-4 py-2.5 text-center shadow-[var(--shadow-pop)]">
                    <div className="text-[13px] font-medium text-fg">Your year starts with one checkmark</div>
                    <div className="mt-0.5 text-xs text-muted">Every completed task lights up a square.</div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Tile>
      </motion.div>
    </div>
  )
}
