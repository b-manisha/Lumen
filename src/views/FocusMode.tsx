import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ChevronDown, Coffee, Pause, Play, RotateCcw, SkipForward, Target, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn, compareTasks, formatMinutes, isOpen } from '../lib/utils'
import { completeTask } from '../lib/actions'
import { EXPO_OUT } from '../lib/motion'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { useTodayTasks } from '../hooks/useDerived'
import { Checkbox } from '../components/Checkbox'
import { Kbd } from '../components/ui'

type Mode = 'work' | 'short' | 'long'
const MODE_LABEL: Record<Mode, string> = { work: 'Focus', short: 'Short break', long: 'Long break' }

export function FocusMode() {
  const focusOpen = useUI((s) => s.focusOpen)
  return <AnimatePresence>{focusOpen && <FocusScreen />}</AnimatePresence>
}

function FocusScreen() {
  const reduce = useReducedMotion()
  const taskId = useUI((s) => s.focusTaskId)
  const endFocus = useUI((s) => s.endFocus)
  const pomodoro = useStore((s) => s.settings.pomodoro)
  const logFocus = useStore((s) => s.logFocus)
  const toggleSubtask = useStore((s) => s.toggleSubtask)
  const tasks = useStore((s) => s.tasks)
  const task = tasks.find((t) => t.id === taskId)
  const { open: todayOpen } = useTodayTasks()
  const candidates = useMemo(() => {
    const ids = new Set(todayOpen.map((t) => t.id))
    return [...todayOpen, ...tasks.filter((t) => isOpen(t) && !ids.has(t.id)).sort(compareTasks)].slice(0, 40)
  }, [todayOpen, tasks])

  const [mode, setMode] = useState<Mode>('work')
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(pomodoro.work * 60)
  const [cycles, setCycles] = useState(0)
  const [picker, setPicker] = useState(false)
  const endsAt = useRef<number | null>(null)
  /** seconds of work accumulated in the current work block that haven't been logged */
  const workAccum = useRef(0)
  const lastTick = useRef<number | null>(null)

  const total = (mode === 'work' ? pomodoro.work : mode === 'short' ? pomodoro.short : pomodoro.long) * 60

  const flushWork = useCallback(() => {
    const mins = Math.floor(workAccum.current / 60)
    if (mins >= 1) {
      logFocus(useUI.getState().focusTaskId, mins)
      workAccum.current -= mins * 60
    }
    return mins
  }, [logFocus])

  const switchMode = useCallback(
    (m: Mode) => {
      setMode(m)
      setRunning(false)
      endsAt.current = null
      lastTick.current = null
      setRemaining((m === 'work' ? pomodoro.work : m === 'short' ? pomodoro.short : pomodoro.long) * 60)
    },
    [pomodoro],
  )

  // Ticker
  useEffect(() => {
    if (!running) return
    if (endsAt.current == null) endsAt.current = Date.now() + remaining * 1000
    lastTick.current = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      if (mode === 'work' && lastTick.current) workAccum.current += (now - lastTick.current) / 1000
      lastTick.current = now
      const left = Math.max(0, Math.round((endsAt.current! - now) / 1000))
      setRemaining(left)
      if (left === 0) {
        window.clearInterval(id)
        setRunning(false)
        endsAt.current = null
        if (mode === 'work') {
          workAccum.current += 1 // round up the final partial second
          const mins = flushWork()
          const next = (cycles + 1) % 4 === 0 ? 'long' : 'short'
          setCycles((c) => c + 1)
          toast.success('Focus block complete', {
            description: `${mins} minutes logged. Time for a ${next === 'long' ? 'long' : 'short'} break.`,
          })
          switchMode(next)
        } else {
          toast('Break’s over', { description: 'Ready for another block?' })
          switchMode('work')
        }
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(() => {
    if (running) {
      setRunning(false)
      endsAt.current = null
    } else setRunning(true)
  }, [running])

  const exit = useCallback(() => {
    const mins = flushWork()
    if (mins > 0) toast(`Logged ${formatMinutes(mins)} of focus`)
    endFocus()
  }, [flushWork, endFocus])

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (picker) setPicker(false)
        else exit()
      } else if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key.toLowerCase() === 'r') switchMode(mode)
      else if (e.key.toLowerCase() === 's') switchMode(mode === 'work' ? 'short' : 'work')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [toggle, exit, switchMode, mode, picker])

  // Tab title
  useEffect(() => {
    const prev = document.title
    return () => {
      document.title = prev
    }
  }, [])
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  useEffect(() => {
    document.title = `${mm}:${ss} · ${MODE_LABEL[mode]} · Lumen`
  }, [mm, ss, mode])

  const size = 320
  const stroke = 6
  const r = size / 2 - 20
  const c = 2 * Math.PI * r
  const progress = 1 - remaining / total
  const accent = mode === 'work' ? 'var(--accent)' : 'var(--success)'
  const subDone = task?.subtasks.filter((s) => s.done).length ?? 0

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      role="dialog"
      aria-label="Focus mode"
    >
      {/* Ambient */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute top-1/2 left-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]"
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 30%, transparent), transparent)` }}
          animate={reduce ? undefined : { scale: running ? [1, 1.08, 1] : 1, opacity: running ? [0.7, 1, 0.7] : 0.55 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -right-40 -bottom-40 size-[600px] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(closest-side, rgba(82,169,255,0.18), transparent)' }}
          animate={reduce ? undefined : { x: [0, -40, 0], y: [0, -30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-faint">
          <span className={cn('size-1.5 rounded-full', running ? 'pulse-dot bg-success' : 'bg-faint')} />
          {running ? 'In session' : 'Paused'} · <span className="tnum">{cycles}</span> block{cycles === 1 ? '' : 's'} done
        </div>
        <button
          onClick={exit}
          className="press inline-flex h-8 items-center gap-2 rounded-ctl px-2.5 text-xs text-muted hover:bg-surface-hover hover:text-fg"
        >
          Exit <Kbd>Esc</Kbd>
          <X className="size-4" />
        </button>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-5 pb-10">
        {/* Task */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EXPO_OUT, delay: 0.1 }}
          className="mb-8 w-full max-w-[560px] text-center"
        >
          <div className="relative inline-block">
            <button
              onClick={() => setPicker((p) => !p)}
              className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-3 py-1 text-[11px] font-medium text-muted backdrop-blur hover:text-fg"
            >
              <Target className="size-3 text-accent" /> {task ? 'Focusing on' : 'Choose a task'} <ChevronDown className="size-3" />
            </button>
            <AnimatePresence>
              {picker && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: EXPO_OUT }}
                  className="elevated absolute top-9 left-1/2 z-10 max-h-72 w-[min(360px,90vw)] -translate-x-1/2 overflow-y-auto rounded-row p-1 text-left"
                >
                  <button
                    onClick={() => {
                      useUI.setState({ focusTaskId: null })
                      setPicker(false)
                    }}
                    className="flex h-8 w-full items-center rounded-ctl px-2 text-[12.5px] text-muted hover:bg-surface-hover hover:text-fg"
                  >
                    No specific task
                  </button>
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        flushWork()
                        useUI.setState({ focusTaskId: t.id })
                        setPicker(false)
                      }}
                      className={cn(
                        'flex h-8 w-full items-center gap-2 truncate rounded-ctl px-2 text-[12.5px] hover:bg-surface-hover',
                        t.id === taskId ? 'text-accent' : 'text-fg',
                      )}
                    >
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <h2 className="display mt-4 text-[26px] text-fg sm:text-[32px]">{task ? task.title : 'Deep work'}</h2>
          {task && task.focusMinutes > 0 && (
            <div className="tnum mt-2 text-xs text-faint">{formatMinutes(task.focusMinutes)} focused on this so far</div>
          )}
        </motion.div>

        {/* Ring */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EXPO_OUT, delay: 0.15 }}
          className="relative"
          style={{ width: 'min(320px, 78vw)', aspectRatio: '1' }}
        >
          <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
            <defs>
              <linearGradient id="focus-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={mode === 'work' ? 'var(--accent-hover)' : '#7EE7B5'} />
                <stop offset="1" stopColor={accent} />
              </linearGradient>
              <filter id="focus-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {Array.from({ length: 60 }, (_, i) => {
              const a = (i / 60) * Math.PI * 2
              const r1 = r + 12
              const r2 = r1 + (i % 5 === 0 ? 7 : 3)
              return (
                <line
                  key={i}
                  x1={size / 2 + Math.cos(a) * r1}
                  y1={size / 2 + Math.sin(a) * r1}
                  x2={size / 2 + Math.cos(a) * r2}
                  y2={size / 2 + Math.sin(a) * r2}
                  stroke={i / 60 <= progress ? accent : 'var(--border-strong)'}
                  strokeWidth={i % 5 === 0 ? 1.5 : 1}
                  opacity={i / 60 <= progress ? 0.9 : 0.5}
                />
              )
            })}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="color-mix(in srgb, var(--text) 9%, transparent)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="url(#focus-grad)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - progress)}
              filter="url(#focus-glow)"
              style={{ transition: 'stroke-dashoffset 300ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[11px] font-medium tracking-[0.16em] uppercase" style={{ color: accent }}>
              {MODE_LABEL[mode]}
            </div>
            <div className="tnum mt-1 font-mono text-[56px] leading-none font-medium tracking-[-0.04em] text-fg sm:text-[68px]">
              {mm}
              <span className={cn('text-faint', running && 'pulse-dot')}>:</span>
              {ss}
            </div>
            <div className="mt-3 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'size-1.5 rounded-full transition-colors',
                    i < cycles % 4 || (cycles > 0 && cycles % 4 === 0)
                      ? 'bg-accent'
                      : 'bg-[color-mix(in_srgb,var(--text)_14%,transparent)]',
                  )}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EXPO_OUT, delay: 0.25 }}
          className="mt-10 flex flex-col items-center gap-6"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => switchMode(mode)}
              aria-label="Reset (R)"
              title="Reset (R)"
              className="press inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-fg"
            >
              <RotateCcw className="size-4" />
            </button>
            <button
              onClick={toggle}
              aria-label={running ? 'Pause' : 'Start'}
              className="press glow inline-flex size-16 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover"
            >
              {running ? <Pause className="size-6" fill="currentColor" /> : <Play className="ml-0.5 size-6" fill="currentColor" />}
            </button>
            <button
              onClick={() => switchMode(mode === 'work' ? 'short' : 'work')}
              aria-label="Skip (S)"
              title="Skip (S)"
              className="press inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-fg"
            >
              {mode === 'work' ? <Coffee className="size-4" /> : <SkipForward className="size-4" />}
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-line bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] p-1 backdrop-blur">
            {(['work', 'short', 'long'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  'press tnum h-7 rounded-full px-3 text-xs font-medium',
                  mode === m ? 'bg-surface-hover text-fg shadow-[0_0_0_1px_var(--border)]' : 'text-faint hover:text-muted',
                )}
              >
                {MODE_LABEL[m]} · {m === 'work' ? pomodoro.work : m === 'short' ? pomodoro.short : pomodoro.long}m
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[11px] text-faint">
            <span className="flex items-center gap-1.5">
              <Kbd>Space</Kbd> start / pause
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>R</Kbd> reset
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>S</Kbd> skip
            </span>
          </div>
        </motion.div>

        {/* Subtasks + complete */}
        {task && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-8 w-full max-w-[420px]">
            {task.subtasks.length > 0 && (
              <div className="card mb-3 p-3">
                <div className="tnum mb-2 text-[11px] font-medium text-faint">
                  Checklist · {subDone}/{task.subtasks.length}
                </div>
                {task.subtasks.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 py-1">
                    <Checkbox checked={s.done} onToggle={() => toggleSubtask(task.id, s.id)} size={15} />
                    <span className={cn('text-[13px]', s.done ? 'text-faint line-through' : 'text-fg')}>{s.title}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                flushWork()
                completeTask(task.id)
                endFocus()
              }}
              className="press mx-auto flex h-9 items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] px-4 text-xs font-medium text-success hover:bg-[color-mix(in_srgb,var(--success)_16%,transparent)]"
            >
              <Check className="size-3.5" /> Mark task complete
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
