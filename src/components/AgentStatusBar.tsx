/**
 * Persistent footer showing what the Manager and Junior agents are doing right now.
 * Data comes from src/lib/agentRun.ts (piles/run.json + piles/status/*.json via the dev bridge).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import * as Popover from '@radix-ui/react-popover'
import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import { CalendarClock, ChevronUp, Clock3, Hand, Zap } from 'lucide-react'
import type { AgentRole } from '../lib/types'
import { EXPO_OUT } from '../lib/motion'
import { cn, isOpen } from '../lib/utils'
import { BRIDGE_AVAILABLE } from '../lib/bridge'
import {
  deriveRows,
  formatElapsed,
  isRunActive,
  nextScheduled,
  ROW_LABEL,
  runProgress,
  useRun,
  clearStalled,
  dismissRun,
  type HireRow,
  type RowState,
  type RunInfo,
  type RunRow,
} from '../lib/agentRun'
import { useNow } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { OWNER_META, roleMeta } from './ownerMeta'
import { OwnerGlyph } from './Owner'
import { ProgressTrack } from './LiveProgress'
import { Tip } from './ui'

const AGENTS: AgentRole[] = ['manager', 'junior']

const ROW_COLOR: Record<RowState | 'revising', string> = {
  revising: 'var(--info)',
  queued: 'var(--text-muted)',
  working: 'var(--info)',
  done: 'var(--accent)',
  returned: 'var(--cho)',
  stalled: 'var(--warning)',
}

function clock(d: Date) {
  return format(d, 'h:mm a')
}

function dayClock(d: Date) {
  if (isToday(d)) return clock(d)
  if (isYesterday(d)) return `yesterday ${clock(d)}`
  if (isTomorrow(d)) return `tomorrow ${clock(d)}`
  return format(d, 'MMM d, h:mm a')
}

/** Everything the bar and panel render, recomputed when the run, statuses or tasks change. */
function useRunView() {
  const s = useRun()
  const tasks = useStore((st) => st.tasks)
  const active = isRunActive(s.run)
  const now = useNow(active ? 1000 : 30_000)
  const rows = useMemo(() => deriveRows(s, tasks, now.getTime()), [s, tasks, now])
  const review = useMemo(() => tasks.filter((t) => isOpen(t) && t.agent?.status === 'review').length, [tasks])
  return { ...s, active, rows, progress: runProgress(rows), review, now }
}

/** The task an agent is visibly on right now, plus how many more it still has. */
function agentFocus(rows: RunRow[], by: AgentRole) {
  const mine = rows.filter((r) => r.by === by)
  if (!mine.length) return null
  const open = mine.filter((r) => r.state === 'working' || r.state === 'stalled' || r.state === 'queued')
  // a manager task whose team is at work is the most interesting one to show; then the most recently updated
  const teamBusy = (r: RunRow) => (r.hires?.some((h) => h.state === 'working' || h.state === 'revising') ? 1 : 0)
  const live = open.filter((r) => r.state !== 'queued').sort((a, b) => teamBusy(b) - teamBusy(a) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const current = live[0] ?? open[0]
  return { current, more: current ? open.length - 1 : 0, done: mine.length - open.length, total: mine.length }
}

export function AgentStatusBar() {
  const v = useRunView()
  const [open, setOpen] = useState(false)
  const offline = !BRIDGE_AVAILABLE || v.conn === 'offline'
  const mode: 'offline' | 'running' | 'idle' | 'checking' = offline ? 'offline' : v.conn === 'checking' ? 'checking' : v.active ? 'running' : 'idle'

  return (
    <footer
      className="glass relative z-20 shrink-0 border-t border-line pb-[env(safe-area-inset-bottom)]"
      aria-label="Agent status"
    >
      {/* hairline glow along the top edge while agents work */}
      <AnimatePresence>
        {mode === 'running' && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-px h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.55), transparent)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: EXPO_OUT }}
          />
        )}
      </AnimatePresence>
      <Popover.Root open={open && !offline} onOpenChange={setOpen}>
        <div className="flex h-[34px] items-center gap-1 px-2 text-[12px] sm:px-3">
          <Popover.Anchor asChild>
            <div className="flex min-w-0 flex-1 items-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  className="flex min-w-0 flex-1 items-center"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: EXPO_OUT } }}
                  exit={{ opacity: 0, y: -3, transition: { duration: 0.14 } }}
                >
                  {mode === 'offline' ? (
                    <OfflineContent />
                  ) : (
                    <>
                      <Popover.Trigger asChild>
                        <button
                          className={cn(
                            'press group flex h-[26px] min-w-0 items-center gap-2.5 rounded-ctl px-2 text-left text-muted hover:bg-surface-hover hover:text-fg',
                            mode === 'running' ? 'flex-1' : 'shrink-0',
                            open && 'bg-surface-hover text-fg',
                          )}
                          aria-label={mode === 'running' ? 'Agents working: show run details' : 'Agents idle: show last run'}
                        >
                          {mode === 'running' ? <RunningContent v={v} /> : <IdleContent checking={mode === 'checking'} />}
                          <ChevronUp
                            className={cn('ml-auto size-3.5 shrink-0 text-faint transition-transform duration-200 group-hover:text-muted', open && 'rotate-180')}
                          />
                        </button>
                      </Popover.Trigger>
                      {mode === 'idle' && <LastRun v={v} />}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </Popover.Anchor>
          {mode !== 'offline' && <ReviewLink count={v.review} />}
          <NextRun now={v.now} />
        </div>
        <AnimatePresence>
          {open && !offline && (
            <Popover.Portal forceMount>
              <Popover.Content
                forceMount
                asChild
                side="top"
                align="start"
                sideOffset={6}
                collisionPadding={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <motion.div
                  className="elevated z-[45] flex max-h-[min(560px,calc(100dvh-80px))] w-[min(440px,calc(100vw-16px))] origin-bottom-left flex-col overflow-hidden rounded-card outline-none"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: EXPO_OUT } }}
                  exit={{ opacity: 0, y: 6, scale: 0.99, transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] } }}
                >
                  <RunPanel v={v} onPick={() => setOpen(false)} />
                </motion.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>
    </footer>
  )
}

type View = ReturnType<typeof useRunView>

function LiveDot({ color = 'var(--success)', pulse }: { color?: string; pulse?: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0">
      {pulse && <span className="absolute -inset-[3px] animate-ping rounded-full opacity-40 [animation-duration:1.8s]" style={{ background: color }} />}
      <span className="relative size-2 rounded-full" style={{ background: color, boxShadow: pulse ? `0 0 8px ${color}` : undefined }} />
    </span>
  )
}

function RunningContent({ v }: { v: View }) {
  const { done, total, percent } = v.progress
  const focus = AGENTS.map((by) => ({ by, f: agentFocus(v.rows, by) })).filter((x) => x.f)
  const lead = focus.find((x) => x.f?.current && x.f.current.state !== 'queued') ?? focus[0]
  return (
    <>
      <LiveDot pulse />
      {/* compact (phones): ● 3/5 · Manager 50% */}
      <span className="flex min-w-0 items-center gap-1.5 sm:hidden">
        <span className="tnum font-mono text-[11.5px] text-fg">
          {done}/{total}
        </span>
        {lead?.f?.current && (
          <span className="min-w-0 truncate">
            · <span style={{ color: OWNER_META[lead.by].color }}>{OWNER_META[lead.by].short}</span>{' '}
            {lead.f.current.state === 'stalled' ? (
              <span className="text-warning">stalled?</span>
            ) : lead.f.current.state === 'queued' ? (
              <span className="text-faint">queued</span>
            ) : (
              <span className="tnum font-mono text-[11.5px] text-fg">{lead.f.current.percent}%</span>
            )}
          </span>
        )}
      </span>
      {/* full */}
      <span className="hidden shrink-0 items-center gap-2 sm:flex">
        <span className="text-fg">
          <span className="tnum font-mono text-[11.5px]">{done}</span> of <span className="tnum font-mono text-[11.5px]">{total}</span> done
        </span>
        <ProgressTrack percent={percent} className="w-16 md:w-24" />
        <span className="tnum w-8 font-mono text-[11px] text-faint">{Math.round(percent)}%</span>
      </span>
      <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
        {focus.map(({ by, f }) => (f ? <AgentChip key={by} by={by} f={f} /> : null))}
      </span>
    </>
  )
}

function AgentChip({ by, f }: { by: AgentRole; f: NonNullable<ReturnType<typeof agentFocus>> }) {
  const m = OWNER_META[by]
  const c = f.current
  const team = c?.hires ?? []
  const busy = team.filter((h) => h.state === 'working' || h.state === 'revising' || h.state === 'stalled')
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span
        className="inline-flex h-[22px] min-w-0 items-center gap-1.5 rounded-full border px-2 text-[11.5px] whitespace-nowrap"
        style={{ borderColor: `rgba(${m.rgb}, 0.28)`, background: `rgba(${m.rgb}, 0.07)` }}
      >
        <span className="font-medium" style={{ color: m.color }}>
          {m.short}
        </span>
        {c ? (
          <>
            <span className="text-faint">·</span>
            {!team.length && (
              <span className={cn('shrink-0', c.state === 'stalled' ? 'text-warning' : 'text-muted')}>
                {c.state === 'stalled' ? 'Stalled?' : c.state === 'queued' ? 'Queued' : (c.phase ?? 'Working')}
              </span>
            )}
            <span className="hidden min-w-0 truncate text-fg lg:inline lg:max-w-[160px] xl:max-w-[220px]">‘{c.title}’</span>
            {team.length > 0 && (
              <span className="tnum shrink-0 text-muted">
                · <span className="font-mono text-[11px]">{team.length}</span> hire{team.length === 1 ? '' : 's'}
              </span>
            )}
            {c.state !== 'queued' && <span className="tnum font-mono text-[11px] text-fg">{c.percent}%</span>}
            {f.more > 0 && <span className="tnum font-mono text-[10.5px] text-faint">+{f.more}</span>}
          </>
        ) : (
          <span className="text-faint">· done {f.done}/{f.total}</span>
        )}
      </span>
      {/* nested hire chips: who on the team is working right now */}
      {busy.slice(0, 2).map((h) => (
        <HireChip key={h.hireId} h={h} />
      ))}
      {busy.length > 2 && <span className="tnum hidden font-mono text-[10.5px] text-faint xl:inline">+{busy.length - 2}</span>}
    </span>
  )
}

function HireChip({ h }: { h: HireRow }) {
  const m = roleMeta(h.role)
  return (
    <span
      className="hidden h-[20px] min-w-0 items-center gap-1 rounded-full border px-1.5 text-[11px] whitespace-nowrap xl:inline-flex"
      style={{ borderColor: `rgba(${m.rgb}, 0.26)`, background: `rgba(${m.rgb}, 0.06)` }}
      title={`${h.title} · ${h.phase ?? ''}`}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
      <span className="max-w-[120px] truncate text-muted">{h.title}</span>
      {h.state === 'stalled' ? (
        <span className="text-warning">?</span>
      ) : (
        <span className="tnum font-mono text-[10.5px] text-fg">{h.state === 'revising' ? 'rev ' : ''}{h.percent}%</span>
      )}
    </span>
  )
}

function lastRunSummary(run: RunInfo | null, rows: RunRow[]): { text: string; tone?: string } {
  if (!run) return { text: 'No runs yet' }
  const when = dayClock(new Date(run.finishedAt ?? run.startedAt))
  const done = rows.filter((r) => r.state === 'done').length
  const returned = rows.filter((r) => r.state === 'returned').length
  const parts = [`${done} done`]
  if (returned) parts.push(`${returned} returned`)
  if (run.state === 'failed' && !run.dismissed) return { text: `Last run failed ${when} · ${parts.join(' · ')}`, tone: 'var(--warning)' }
  if (run.abandoned) return { text: `Last run didn’t finish · started ${dayClock(new Date(run.startedAt))}`, tone: 'var(--warning)' }
  return { text: `Last run ${when} · ${parts.join(' · ')}` }
}

function IdleContent({ checking }: { checking: boolean }) {
  return (
    <>
      <LiveDot color={checking ? 'var(--text-faint)' : 'color-mix(in srgb, var(--success) 70%, var(--text-faint))'} />
      <span className="shrink-0 text-fg">{checking ? 'Connecting…' : 'Agents idle'}</span>
    </>
  )
}

/** "Last run 2:04 PM · 5 done" → opens the run summary report; an abandoned run offers Dismiss instead. */
function LastRun({ v }: { v: View }) {
  const openReader = useUI((s) => s.openReader)
  const run = v.run
  const last = lastRunSummary(run, v.rows)
  if (!run) return <span className="hidden min-w-0 truncate text-faint sm:inline">· {last.text}</span>
  if (run.abandoned)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="hidden min-w-0 truncate sm:inline" style={{ color: 'var(--warning)' }}>
          · {last.text}
        </span>
        <button onClick={() => void dismissRun(run.runId)} className="press shrink-0 rounded-ctl px-1.5 py-0.5 text-[11.5px] text-muted hover:bg-surface-hover hover:text-fg">
          Dismiss
        </button>
      </span>
    )
  return (
    <Tip content="Open the run summary report">
      <button
        onClick={() => openReader({ kind: 'run', startedAt: run.startedAt, runId: run.runId })}
        className="press hidden h-[26px] min-w-0 items-center truncate rounded-ctl px-1.5 text-left hover:bg-surface-hover hover:text-fg sm:flex"
        style={last.tone ? { color: last.tone } : undefined}
      >
        <span className="truncate underline decoration-[var(--border-strong)] decoration-dotted underline-offset-[3px]">{last.text}</span>
      </button>
    </Tip>
  )
}

function OfflineContent() {
  return (
    <Tip
      content={
        BRIDGE_AVAILABLE ? 'The dev bridge isn’t answering. Is `npm run dev` running?' : 'No agent bridge in this build. Run `npm run dev` to see live agent progress.'
      }
    >
      <span className="flex h-[26px] min-w-0 items-center gap-2.5 px-2 text-faint" tabIndex={0}>
        <span className="size-2 shrink-0 rounded-full border border-[var(--text-faint)]" />
        Agents offline
      </span>
    </Tip>
  )
}

function ReviewLink({ count }: { count: number }) {
  const setView = useUI((s) => s.setView)
  const setStatus = useUI((s) => s.setDelegationStatus)
  if (!count) return null
  return (
    <button
      onClick={() => {
        setStatus('review')
        setView({ kind: 'delegation' })
      }}
      className="press inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-ctl px-2 text-accent hover:bg-accent-soft"
    >
      <span className="hidden text-faint sm:inline">·</span>
      <span className="tnum font-mono text-[11.5px]">{count}</span>
      <span className="hidden sm:inline">awaiting your review</span>
      <span className="sm:hidden">to review</span>
    </button>
  )
}

function NextRun({ now }: { now: Date }) {
  const next = nextScheduled(now)
  return (
    <Tip content="Scheduled agent runs: 9:00 AM and 2:00 PM daily">
      <span className="hidden h-[26px] shrink-0 items-center gap-1.5 px-2 text-faint md:inline-flex" tabIndex={0}>
        <CalendarClock className="size-3.5" />
        Next run <span className="tnum font-mono text-[11.5px] text-muted">{dayClock(next)}</span>
      </span>
    </Tip>
  )
}

// ── Expanded panel ──

function RunPanel({ v, onPick }: { v: View; onPick: () => void }) {
  const edit = useUI((s) => s.edit)
  const run = v.run
  const { done, total, percent } = v.progress
  if (!run) {
    return (
      <div className="p-5 text-center">
        <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-surface-hover text-faint">
          <Zap className="size-4" />
        </div>
        <div className="text-[13px] font-medium text-fg">No agent runs yet</div>
        <p className="mt-1 text-xs text-pretty text-faint">
          Ask Claude Code to “run the piles”, or wait for the scheduled run at <span className="tnum font-mono">{dayClock(nextScheduled(v.now))}</span>.
        </p>
      </div>
    )
  }
  const started = new Date(run.startedAt)
  const stateLabel = v.active ? 'Running' : run.state === 'failed' ? 'Failed' : run.abandoned ? 'Didn’t finish' : 'Finished'
  const stateColor = v.active ? 'var(--success)' : run.state === 'failed' || run.abandoned ? 'var(--warning)' : 'var(--text-muted)'
  return (
    <>
      <div className="border-b border-line px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-fg">{v.active ? 'Agents at work' : 'Last agent run'}</span>
          <span
            className="inline-flex h-[18px] items-center gap-1.5 rounded-full border px-1.5 text-[10.5px] font-medium"
            style={{ color: stateColor, borderColor: `color-mix(in srgb, ${stateColor} 30%, transparent)` }}
          >
            {v.active && <span className="pulse-dot size-1.5 rounded-full" style={{ background: stateColor }} />}
            {stateLabel}
          </span>
          <span className="tnum ml-auto font-mono text-[11.5px] text-muted">
            {done}/{total}
          </span>
          {run.abandoned && (
            <button onClick={() => void dismissRun(run.runId)} className="press rounded-ctl border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-fg">
              Dismiss
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-faint">
          <span className="inline-flex items-center gap-1">
            <Clock3 className="size-3" /> Started <span className="tnum font-mono text-muted">{dayClock(started)}</span>
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            {run.trigger === 'scheduled' ? <CalendarClock className="size-3" /> : <Hand className="size-3" />}
            {run.trigger === 'scheduled' ? 'Scheduled run' : 'Started by you'}
          </span>
          {run.finishedAt && (
            <>
              <span>·</span>
              <span>
                took <span className="tnum font-mono text-muted">{formatElapsed(Date.parse(run.finishedAt) - started.getTime())}</span>
              </span>
            </>
          )}
        </div>
        <ProgressTrack percent={percent} className="mt-2.5" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {AGENTS.map((by) => {
          const rows = v.rows.filter((r) => r.by === by)
          if (!rows.length) return null
          const finished = rows.filter((r) => r.state === 'done' || r.state === 'returned').length
          return (
            <section key={by} className="pb-1">
              <div className="flex items-center gap-2 px-2.5 pt-2 pb-1.5">
                <OwnerGlyph owner={by} size={16} tip={null} />
                <span className="text-[11.5px] font-medium text-muted">{OWNER_META[by].label}</span>
                <span className="tnum ml-auto font-mono text-[11px] text-faint">
                  {finished}/{rows.length}
                </span>
              </div>
              <motion.ul layout initial={false}>
                {rows.map((r) => (
                  <motion.li key={r.taskId} layout="position" transition={{ duration: 0.32, ease: EXPO_OUT }}>
                    <RunRowItem
                      row={r}
                      onClick={() => {
                        onPick()
                        edit(r.taskId)
                      }}
                    />
                    {r.state === 'stalled' && (
                      <div className="flex items-center gap-2 px-2.5 pb-2 text-[11px] text-faint">
                        <span className="min-w-0 flex-1 truncate">No update for 15+ minutes. The agent may have stopped.</span>
                        <button
                          onClick={() => void clearStalled(run.runId, r.taskId)}
                          className="press shrink-0 rounded-ctl border border-line px-1.5 py-0.5 text-muted hover:border-line-strong hover:text-fg"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                    {r.hires && <TeamRows row={r} />}
                  </motion.li>
                ))}
              </motion.ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

/** Org tree under a manager task: Manager → its hires, each with its own progress. */
function TeamRows({ row }: { row: RunRow }) {
  const hires = row.hires ?? []
  if (!hires.length)
    return <div className="pb-1.5 pl-[38px] text-[11px] text-faint">{row.rationale ? `Working alone · ${row.rationale}` : 'Working alone'}</div>
  return (
    <ul className="relative mb-1.5 ml-[18px] border-l border-line-strong">
      {hires.map((h, i) => {
        const m = roleMeta(h.role)
        return (
          <li key={h.hireId} className="relative py-1 pr-2.5 pl-4">
            <span aria-hidden className="absolute top-[15px] left-0 h-px w-3 bg-line-strong" />
            {i === hires.length - 1 && <span aria-hidden className="absolute top-[16px] -bottom-px -left-px w-px bg-[var(--bg-elevated)]" />}
            <div className="flex items-center gap-1.5">
              <OwnerGlyph owner={h.role} size={14} tip={null} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{h.title}</span>
              <span className="text-[10.5px] font-medium" style={{ color: m.color }}>
                {m.short}
              </span>
              <StatePill state={h.state} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 pl-5 text-[11px] text-faint">
              <span className="min-w-0 flex-1 truncate">
                {h.state === 'queued'
                  ? h.dependsOn?.length
                    ? `Waiting on ${h.dependsOn.join(', ')}`
                    : 'Waiting to start'
                  : h.state === 'done'
                    ? h.deliverable || 'Delivered'
                    : [h.phase, h.message].filter(Boolean).join(' · ')}
              </span>
              {h.elapsed != null && <span className="tnum shrink-0 font-mono text-[10.5px]">{formatElapsed(h.elapsed)}</span>}
              <span className="tnum w-8 shrink-0 text-right font-mono text-[10.5px] text-muted">{h.percent}%</span>
            </div>
            <ProgressTrack percent={h.percent} by={h.role} stalled={h.state === 'stalled'} className="mt-1 ml-5 h-[2px]" />
          </li>
        )
      })}
    </ul>
  )
}

function StatePill({ state }: { state: RowState | 'revising' }) {
  const color = ROW_COLOR[state]
  return (
    <span
      className="inline-flex h-[18px] shrink-0 items-center gap-1.5 rounded-full border px-1.5 text-[10.5px] font-medium whitespace-nowrap"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} ${state === 'queued' ? 5 : 10}%, transparent)`,
      }}
    >
      <span className={cn('size-1.5 rounded-full', (state === 'working' || state === 'revising') && 'pulse-dot')} style={{ background: color }} />
      {state === 'done' ? 'Done' : state === 'revising' ? 'Revising' : ROW_LABEL[state]}
    </span>
  )
}

function RunRowItem({ row, onClick }: { row: RunRow; onClick: () => void }) {
  const detail: ReactNode =
    row.state === 'done' ? (
      'Ready for your review'
    ) : row.state === 'returned' ? (
      'Needs you: open to see what’s prepared'
    ) : row.state === 'queued' ? (
      'Waiting for the agent'
    ) : (
      <>
        <span className={row.state === 'stalled' ? 'text-warning' : 'text-muted'}>{row.state === 'stalled' ? `Stalled? · ${row.phase ?? 'no update'}` : row.phase}</span>
        {row.message && <span className="text-faint"> · {row.message}</span>}
      </>
    )
  return (
    <button onClick={onClick} className="press group w-full rounded-row px-2.5 py-2 text-left hover:bg-surface-hover">
      <div className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-[13px]', row.state === 'done' || row.state === 'returned' ? 'text-muted' : 'text-fg')}>{row.title}</span>
        <StatePill state={row.state} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11.5px] text-faint">
        <span className="min-w-0 flex-1 truncate">{detail}</span>
        {row.elapsed != null && <span className="tnum shrink-0 font-mono text-[11px]">{formatElapsed(row.elapsed)}</span>}
        <span className="tnum w-9 shrink-0 text-right font-mono text-[11px] text-muted">{row.percent}%</span>
      </div>
      <ProgressTrack percent={row.percent} by={row.by} stalled={row.state === 'stalled'} className="mt-1.5" />
    </button>
  )
}
