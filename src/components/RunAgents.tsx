/**
 * The in-app "Run agents" controls (dev server only, see src/lib/runControl.ts and plugins/runner.ts):
 * - RunAgentsButton: the Delegation header button ("header") and the compact one in the idle status bar ("bar")
 * - a confirm popover listing what will run, grouped by Manager and Junior
 * - "Running…" with a Stop action (its own confirm) while a run is in progress
 * - RunLogDrawer: the tail of the current/last orchestrator log
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import * as Popover from '@radix-ui/react-popover'
import { Check, Copy, Info, Loader2, Play, ScrollText, Sparkles, Square, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentRole } from '../lib/types'
import { EXPO_OUT } from '../lib/motion'
import { cn } from '../lib/utils'
import { BRIDGE_AVAILABLE } from '../lib/bridge'
import { formatElapsed, useRun } from '../lib/agentRun'
import { RUN_BUTTON_AVAILABLE, pollRunner, startRun, stopRun, useAnyRunActive, useRunner, type RunnableTask } from '../lib/runControl'
import { useNow } from '../hooks/useDerived'
import { Button, Kbd, Tip } from './ui'
import { Modal } from './Modal'
import { OWNER_META } from './ownerMeta'
import { OwnerGlyph } from './Owner'

const AGENTS: AgentRole[] = ['manager', 'junior']
const OFFLINE_TIP = 'Run from Claude Code: ask it to “run the piles” in this folder.'

const popoverMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: EXPO_OUT } },
  exit: { opacity: 0, y: -2, scale: 0.99, transition: { duration: 0.15, ease: [0.4, 0, 0.2, 1] as const } },
}

/** Run agents / Running… / disabled, depending on the bridge and the runner. */
export function RunAgentsButton({ variant = 'header' }: { variant?: 'header' | 'bar' }) {
  const state = useRunner((s) => s.state)
  const busy = useRunner((s) => s.busy)
  const confirmPending = useRunner((s) => s.confirmPending)
  const conn = useRun((s) => s.conn)
  const running = useAnyRunActive() || busy === 'start'
  const [open, setOpen] = useState(false)

  // ⌘K "Run agents now" (only the header button answers it, also when the view mounts after the request)
  useEffect(() => {
    if (variant !== 'header' || !confirmPending) return
    useRunner.setState({ confirmPending: false })
    void pollRunner().then((s) => {
      if (!s) return toast.error('Couldn’t reach the dev server', { description: 'Is `npm run dev` running?' })
      if (s.active || s.runActive) return toast('Agents are already running', { description: 'Watch them in the status bar below.' })
      if (s.reason === 'nothing' || s.reason === 'no-queue') return toast('Nothing to run', { description: s.message })
      setOpen(true)
    })
  }, [confirmPending, variant])

  if (!BRIDGE_AVAILABLE) {
    // production build: no runner here
    if (variant === 'bar') return null
    return (
      <Tip content={<span className="block max-w-[240px]">No agent runner in this build. {OFFLINE_TIP}</span>}>
        <span tabIndex={0} className="inline-flex rounded-ctl">
          <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} disabled aria-disabled>
            <span className="hidden sm:inline">Run agents</span>
          </Button>
        </span>
      </Tip>
    )
  }
  // a ?bridge=read tab follows runs but never starts them
  if (!RUN_BUTTON_AVAILABLE) return null
  const offline = conn === 'offline'
  if (variant === 'bar' && (running || offline || !state)) return null

  if (running && variant === 'header') return <RunningButton />

  const selectable = state?.selectable ?? []
  const disabled = offline || !state || state.reason === 'nothing' || state.reason === 'no-queue'
  const tip = offline
    ? `The dev server isn’t answering. ${OFFLINE_TIP}`
    : !state
      ? 'Checking the queue…'
      : state.reason === 'nothing'
        ? 'Nothing queued for agents'
        : state.reason === 'no-queue'
          ? state.message
          : `Run ${selectable.length} queued task${selectable.length === 1 ? '' : 's'} now`

  const trigger =
    variant === 'header' ? (
      <Button
        size="sm"
        variant={disabled ? 'secondary' : 'primary'}
        icon={<Play className="size-3.5 fill-current" />}
        disabled={disabled}
        aria-label="Run agents"
        className={cn(open && 'bg-accent-hover')}
      >
        <span className="hidden sm:inline">Run agents</span>
        {!disabled && selectable.length > 0 && (
          <span className="tnum -mr-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-[4px] bg-white/18 px-1 font-mono text-[10.5px] leading-none">
            {selectable.length}
          </span>
        )}
      </Button>
    ) : (
      <button
        disabled={disabled}
        aria-label="Run agents"
        className={cn(
          'press group inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap',
          'border-[rgba(var(--accent-rgb),0.32)] bg-[rgba(var(--accent-rgb),0.08)] text-accent hover:border-[rgba(var(--accent-rgb),0.55)] hover:bg-[rgba(var(--accent-rgb),0.14)]',
          'disabled:border-line disabled:bg-transparent disabled:text-faint',
          open && 'border-[rgba(var(--accent-rgb),0.55)] bg-[rgba(var(--accent-rgb),0.14)]',
        )}
      >
        <Play className="size-2.5 fill-current" />
        Run
        {!disabled && <span className="tnum font-mono text-[10.5px] opacity-80">{selectable.length}</span>}
      </button>
    )

  if (disabled)
    return (
      <Tip content={tip}>
        <span tabIndex={0} className="inline-flex rounded-ctl" aria-label={`Run agents: ${tip}`}>
          {trigger}
        </span>
      </Tip>
    )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tip content={tip}>
        <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      </Tip>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              forceMount
              asChild
              side={variant === 'bar' ? 'top' : 'bottom'}
              align="end"
              sideOffset={8}
              collisionPadding={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <motion.div className={cn('elevated z-[70] w-[min(360px,calc(100vw-16px))] overflow-hidden rounded-card outline-none', variant === 'bar' ? 'origin-bottom' : 'origin-top-right')} {...popoverMotion}>
                <RunConfirm tasks={selectable} cliMissing={state?.cli === 'missing'} onDone={() => setOpen(false)} />
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  )
}

/** The confirm popover: what will run, grouped by agent, with a usage note. */
function RunConfirm({ tasks, cliMissing, onDone }: { tasks: RunnableTask[]; cliMissing: boolean; onDone: () => void }) {
  const [picked, setPicked] = useState(() => new Set(tasks.map((t) => t.id)))
  const runRef = useRef<HTMLButtonElement>(null)
  const busy = useRunner((s) => s.busy === 'start')
  useEffect(() => {
    requestAnimationFrame(() => runRef.current?.focus({ preventScroll: true }))
  }, [])
  const chosen = tasks.filter((t) => picked.has(t.id))
  const hasManager = chosen.some((t) => t.by === 'manager')
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const run = async () => {
    const all = chosen.length === tasks.length
    const ok = await startRun(all ? undefined : chosen.map((t) => t.id))
    if (ok) onDone()
  }
  // ⌘↵ / Ctrl↵ runs, wherever focus is while the popover is open
  const runRefFn = useRef(run)
  useEffect(() => {
    runRefFn.current = chosen.length && !busy ? run : async () => {}
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        void runRefFn.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div>
      <div className="relative flex items-start gap-3 border-b border-line px-4 pt-3.5 pb-3">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb),0.6), transparent)' }}
        />
        <span
          className="mt-px inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] text-accent"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--accent-rgb),0.26), rgba(var(--accent-rgb),0.06))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(var(--accent-rgb),0.38), 0 0 22px -6px rgba(var(--accent-rgb),0.7)',
          }}
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-fg">Run agents now</div>
          <div className="tnum mt-0.5 text-[11.5px] text-faint">
            {chosen.length} of {tasks.length} task{tasks.length === 1 ? '' : 's'} · Claude Code runs them in the background
          </div>
        </div>
      </div>

      <div className="max-h-[min(300px,45dvh)] overflow-y-auto p-1.5">
        {AGENTS.map((by) => {
          const group = tasks.filter((t) => t.by === by)
          if (!group.length) return null
          return (
            <section key={by} className="pb-1">
              <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-1">
                <OwnerGlyph owner={by} size={16} tip={null} />
                <span className="text-[11.5px] font-medium text-muted">{OWNER_META[by].label}</span>
                <span className="tnum ml-auto font-mono text-[11px] text-faint">{group.filter((t) => picked.has(t.id)).length}/{group.length}</span>
              </div>
              <ul>
                {group.map((t) => {
                  const on = picked.has(t.id)
                  return (
                    <li key={t.id}>
                      <button
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(t.id)}
                        className="press group flex w-full items-center gap-2.5 rounded-row px-2.5 py-1.5 text-left hover:bg-surface-hover"
                      >
                        <span
                          className={cn(
                            'inline-flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150',
                            on ? 'border-transparent bg-accent text-white' : 'border-line-strong text-transparent group-hover:border-[var(--text-faint)]',
                          )}
                        >
                          <Check className="size-[11px]" strokeWidth={3} />
                        </span>
                        <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', on ? 'text-fg' : 'text-faint line-through decoration-[var(--border-strong)]')}>
                          {t.title}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <div className="space-y-1.5 border-t border-line px-4 py-2.5 text-[11.5px] leading-snug text-faint">
        <p className="flex gap-1.5">
          <Info className="mt-px size-3.5 shrink-0" />
          <span className="text-pretty">
            {hasManager ? 'Manager tasks may hire up to 4 Senior/Junior agents · ' : ''}uses your Claude usage
          </span>
        </p>
        {cliMissing && (
          <p className="flex gap-1.5 text-warning">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span className="text-pretty">Claude Code CLI not found on this machine.</span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2.5">
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          ref={runRef}
          size="sm"
          variant="primary"
          disabled={!chosen.length || busy}
          onClick={() => void run()}
          icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 fill-current" />}
        >
          {busy ? 'Starting…' : `Run ${chosen.length}`}
          <Kbd className="ml-0.5 hidden border-white/25 bg-white/10 text-white/80 sm:inline-flex">⌘↵</Kbd>
        </Button>
      </div>
    </div>
  )
}

/** "Running…" with a spinner, plus Stop when the run was started from Lumen. */
function RunningButton() {
  const state = useRunner((s) => s.state)
  const busy = useRunner((s) => s.busy)
  const canStop = !!state?.active
  const now = useNow(1000)
  const since = state?.startedAt ? formatElapsed(Math.max(0, now.getTime() - Date.parse(state.startedAt))) : null
  return (
    <span className="inline-flex items-center gap-1.5">
      <Tip content={canStop ? 'Agents are working. Watch them in the status bar below.' : 'A run started from Claude Code or the schedule is in progress.'}>
        <span
          tabIndex={0}
          role="status"
          className="inline-flex h-7 items-center gap-1.5 rounded-ctl border px-2.5 text-xs font-medium whitespace-nowrap text-fg"
          style={{ borderColor: 'rgba(var(--accent-rgb),0.35)', background: 'rgba(var(--accent-rgb),0.08)' }}
        >
          <Loader2 className="size-3.5 animate-spin text-accent" />
          {busy === 'start' ? 'Starting…' : busy === 'stop' ? 'Stopping…' : 'Running…'}
          {since && <span className="tnum hidden font-mono text-[11px] text-faint sm:inline">{since}</span>}
        </span>
      </Tip>
      {canStop && <StopButton />}
    </span>
  )
}

/** Stop the Lumen-started run, after its own confirm. */
export function StopButton({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const busy = useRunner((s) => s.busy === 'stop')
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {compact ? (
          <button className="press inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-line px-2 text-[11.5px] text-muted hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:text-danger">
            <Square className="size-2.5 fill-current" /> Stop
          </button>
        ) : (
          <Button size="sm" variant="secondary" icon={<Square className="size-3 fill-current" />} aria-label="Stop the agent run" className="hover:text-danger">
            <span className="hidden sm:inline">Stop</span>
          </Button>
        )}
      </Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content forceMount asChild side={compact ? 'top' : 'bottom'} align="end" sideOffset={8} collisionPadding={8}>
              <motion.div className="elevated z-[70] w-[min(300px,calc(100vw-16px))] rounded-card p-4 outline-none" {...popoverMotion}>
                <div className="text-[13.5px] font-semibold text-fg">Stop this run?</div>
                <p className="mt-1 text-[12px] leading-snug text-pretty text-muted">
                  Agents stop mid-task. Results already written are kept; the run is marked as stopped and unfinished tasks stay queued.
                </p>
                <div className="mt-3.5 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(false)} autoFocus>
                    Keep running
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    className="border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-danger hover:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
                    icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3 fill-current" />}
                    onClick={() => void stopRun().then(() => setOpen(false))}
                  >
                    {busy ? 'Stopping…' : 'Stop run'}
                  </Button>
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  )
}

/** "View log" link (status panel). */
export function ViewLogLink({ className, children, onOpen }: { className?: string; children?: ReactNode; onOpen?: () => void }) {
  const log = useRunner((s) => s.state?.log)
  if (!log) return null
  return (
    <button
      onClick={() => {
        onOpen?.()
        useRunner.setState({ logOpen: true })
      }}
      className={cn('press inline-flex items-center gap-1 rounded-ctl text-[11.5px] text-muted hover:text-fg', className)}
    >
      <ScrollText className="size-3" />
      {children ?? 'View log'}
    </button>
  )
}

function lineClass(l: string) {
  if (l.startsWith('[lumen')) return 'text-faint'
  if (/^\s*(↳ )?✕/.test(l) || /error|failed/i.test(l.slice(0, 40))) return 'text-danger'
  if (/^\s*(↳ )?→/.test(l)) return 'text-muted'
  if (l.startsWith('Finished')) return 'text-success'
  return 'text-fg'
}

/** Slide-over with the tail of the current or last orchestrator log. */
export function RunLogDrawer() {
  const open = useRunner((s) => s.logOpen)
  const lines = useRunner((s) => s.logLines)
  const state = useRunner((s) => s.state)
  const boxRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) void pollRunner(300)
  }, [open])
  useEffect(() => {
    const el = boxRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [lines, open])

  const status = useMemo(() => {
    if (!state) return null
    if (state.active) return { text: `Running · pid ${state.pid}`, color: 'var(--success)', pulse: true }
    const x = state.lastExit
    if (!x) return null
    if (x.stoppedByUser) return { text: 'Stopped by you', color: 'var(--text-muted)' }
    if (x.ok) return { text: 'Finished · exit code 0', color: 'var(--text-muted)' }
    return { text: x.code == null ? 'Ended unexpectedly' : `Failed · exit code ${x.code}`, color: 'var(--danger)' }
  }, [state])

  const close = () => useRunner.setState({ logOpen: false })
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toast.error('Couldn’t copy the log')
    }
  }

  return (
    <Modal open={open} onClose={close} side title="Agent run log" description={state?.log ?? 'No run started from Lumen yet'}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-[12px]">
          {status && (
            <span
              className="inline-flex h-[20px] items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium"
              style={{ color: status.color, borderColor: `color-mix(in srgb, ${status.color} 30%, transparent)` }}
            >
              <span className={cn('size-1.5 rounded-full', status.pulse && 'pulse-dot')} style={{ background: status.color }} />
              {status.text}
            </span>
          )}
          <span className="tnum font-mono text-[11px] text-faint">{lines.length} lines</span>
          <Button size="sm" variant="ghost" className="ml-auto" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={() => void copy()} disabled={!lines.length}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <div
          ref={boxRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          className="min-h-[200px] flex-1 overflow-auto rounded-row border border-line bg-[color-mix(in_srgb,var(--text)_2.5%,var(--bg))] p-3 font-mono text-[11.5px] leading-[1.6] shadow-[inset_0_1px_0_var(--highlight)]"
          role="log"
          aria-live="polite"
          tabIndex={0}
        >
          {lines.length ? (
            lines.map((l, i) => (
              <div key={i} className={cn('break-words whitespace-pre-wrap', lineClass(l))}>
                {l}
              </div>
            ))
          ) : (
            <div className="text-faint">Nothing logged yet.</div>
          )}
        </div>
        <p className="text-[11px] leading-snug text-pretty text-faint">
          The last 20 logs are kept in <code className="font-mono">piles/logs/</code>. Showing the most recent 300 lines.
        </p>
      </div>
    </Modal>
  )
}

/** Status bar: the orchestrator is starting up (process alive, run.json not written yet). */
export function StartingContent() {
  const startedAt = useRunner((s) => s.state?.startedAt)
  const now = useNow(1000)
  return (
    <span className="flex min-w-0 items-center gap-2.5 px-2">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
      <span className="min-w-0 truncate text-fg">
        Starting agents<span className="hidden sm:inline"> · the orchestrator is reading the queue</span>
      </span>
      {startedAt && <span className="tnum shrink-0 font-mono text-[11px] text-faint">{formatElapsed(Math.max(0, now.getTime() - Date.parse(startedAt)))}</span>}
    </span>
  )
}
