import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Battery, BatteryFull, BatteryMedium, Check, Minus, Plus, Sunrise } from 'lucide-react'
import { toast } from 'sonner'
import type { Energy } from '../lib/types'
import { cn, dueLabel, formatMinutes, isToday, PRIORITY_META, todayKey } from '../lib/utils'
import { REASON_LABEL, suggestForToday, type SuggestReason } from '../lib/suggest'
import { EXPO_OUT } from '../lib/motion'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from '../components/Modal'
import { Button } from '../components/ui'

const REASON_COLOR: Record<SuggestReason, string> = {
  overdue: 'var(--danger)',
  priority: 'var(--p2)',
  'due-soon': 'var(--accent)',
  'in-progress': 'var(--success)',
  backlog: 'var(--text-faint)',
}

export function PlanDay() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  return (
    <Modal open={overlay === 'plan'} onClose={close} title="Plan my day" hideHeader className="w-[min(640px,100%)]">
      <PlanBody onDone={close} />
    </Modal>
  )
}

function PlanBody({ onDone }: { onDone: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const cap0 = useStore((s) => s.settings.dailyCap)
  const setSettings = useStore((s) => s.setSettings)
  const planDay = useStore((s) => s.planDay)
  const [step, setStep] = useState(0)
  const [energy, setEnergy] = useState<Energy | 'any'>('any')
  const [cap, setCap] = useState(cap0)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const today = todayKey()

  const suggestions = useMemo(() => suggestForToday(tasks, energy), [tasks, energy])
  const initial = useMemo(() => {
    const already = suggestions.filter((s) => isToday(s.task, today)).map((s) => s.task.id)
    const picks = new Set(already.slice(0, Math.max(cap, 0)))
    for (const s of suggestions) {
      if (picks.size >= cap) break
      picks.add(s.task.id)
    }
    return picks
  }, [suggestions, cap, today])
  const sel = selected ?? initial

  const chosen = suggestions.filter((s) => sel.has(s.task.id))
  const minutes = chosen.reduce((n, s) => n + (s.task.estimate ?? 30), 0)
  const over = sel.size > cap

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const commit = () => {
    planDay([...sel])
    if (cap !== cap0) setSettings({ dailyCap: cap })
    toast.success('Your day is planned', {
      description: `${sel.size} task${sel.size === 1 ? '' : 's'} · about ${formatMinutes(minutes)} of work.`,
    })
    useUI.getState().setView({ kind: 'today' })
    onDone()
  }

  return (
    <div className="flex max-h-[min(720px,88vh)] flex-col">
      {/* Header */}
      <div className="relative shrink-0 overflow-hidden border-b border-line px-6 pt-6 pb-5">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(245,183,72,0.25),transparent)] blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-warning">
            <Sunrise className="size-4" /> Morning ritual
          </div>
          <div className="flex gap-1">
            {[0, 1].map((i) => (
              <span
                key={i}
                className={cn('h-1 rounded-full transition-all duration-300', i === step ? 'w-6 bg-accent' : 'w-2 bg-line-strong')}
              />
            ))}
          </div>
        </div>
        <h2 className="display relative mt-3 text-[22px] text-fg">{step === 0 ? 'How’s your energy today?' : 'Choose today’s list'}</h2>
        <p className="relative mt-1 text-[13px] text-muted">
          {step === 0
            ? 'We’ll match suggestions to how you feel. Be honest. Good plans are realistic plans.'
            : 'Suggested from overdue, priority and due dates. Tap to adjust.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.28, ease: EXPO_OUT }}
              className="p-6"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { v: 'high', icon: <BatteryFull />, title: 'Charged', body: 'Up for deep, demanding work', color: 'var(--warning)' },
                    { v: 'any', icon: <BatteryMedium />, title: 'Steady', body: 'A healthy mix of everything', color: 'var(--accent)' },
                    { v: 'low', icon: <Battery />, title: 'Low battery', body: 'Light, admin, low-effort tasks', color: 'var(--info)' },
                  ] as const
                ).map((o) => {
                  const on = energy === o.v
                  return (
                    <button
                      key={o.v}
                      onClick={() => {
                        setEnergy(o.v)
                        setSelected(null)
                      }}
                      className={cn(
                        'press card spotlight flex flex-col items-start p-4 text-left transition-[border-color,box-shadow]',
                        on && 'border-transparent',
                      )}
                      style={on ? { boxShadow: `0 0 0 1px ${o.color}, 0 0 28px -10px ${o.color}` } : undefined}
                    >
                      <span
                        className="flex size-9 items-center justify-center rounded-row [&>svg]:size-5"
                        style={{ color: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` }}
                      >
                        {o.icon}
                      </span>
                      <span className="mt-3 text-[13.5px] font-semibold text-fg">{o.title}</span>
                      <span className="mt-0.5 text-xs text-muted">{o.body}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-6 flex items-center justify-between rounded-row border border-line px-4 py-3">
                <div>
                  <div className="text-[13px] font-medium text-fg">Daily cap</div>
                  <div className="text-xs text-faint">How many tasks can you realistically finish?</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCap((c) => Math.max(1, c - 1))
                      setSelected(null)
                    }}
                    className="press inline-flex size-7 items-center justify-center rounded-ctl border border-line text-muted hover:text-fg"
                    aria-label="Decrease"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="display tnum w-7 text-center text-[20px] text-fg">{cap}</span>
                  <button
                    onClick={() => {
                      setCap((c) => Math.min(20, c + 1))
                      setSelected(null)
                    }}
                    className="press inline-flex size-7 items-center justify-center rounded-ctl border border-line text-muted hover:text-fg"
                    aria-label="Increase"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.28, ease: EXPO_OUT }}
              className="px-3 py-3"
            >
              {suggestions.length === 0 && (
                <div className="py-12 text-center text-sm text-faint">No open tasks match. Add a few with Q first.</div>
              )}
              {suggestions.slice(0, 30).map((s, i) => {
                const on = sel.has(s.task.id)
                return (
                  <motion.button
                    key={s.task.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EXPO_OUT, delay: Math.min(i, 12) * 0.02 }}
                    onClick={() => toggle(s.task.id)}
                    className={cn(
                      'mb-0.5 flex w-full items-center gap-3 rounded-row px-3 py-2.5 text-left transition-colors',
                      on ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                        on ? 'border-accent bg-accent text-white' : 'border-line-strong',
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-[13.5px]', on ? 'text-fg' : 'text-muted')}>{s.task.title}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                        <span className="font-medium" style={{ color: REASON_COLOR[s.reason] }}>
                          {REASON_LABEL[s.reason]}
                        </span>
                        {s.task.due && <span className="tnum">· {dueLabel(s.task.due)}</span>}
                        {s.task.priority < 4 && (
                          <span style={{ color: PRIORITY_META[s.task.priority].color }}>· {PRIORITY_META[s.task.priority].short}</span>
                        )}
                        {s.task.energy && <span>· {s.task.energy === 'high' ? 'High energy' : 'Low energy'}</span>}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[11px] text-faint">{formatMinutes(s.task.estimate ?? 30)}</span>
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        {step === 0 ? (
          <span className="text-xs text-faint">Step 1 of 2</span>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="tnum flex items-center gap-2 text-xs">
              <span className={over ? 'text-warning' : 'text-fg'}>
                {sel.size}/{cap} tasks
              </span>
              <span className="text-faint">· ~{formatMinutes(minutes)}</span>
              {over && <span className="hidden text-warning sm:inline">· over your cap</span>}
            </div>
            <div className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-surface-hover">
              <motion.div
                className={cn('h-full rounded-full', over ? 'bg-warning' : 'bg-accent')}
                animate={{ width: `${Math.min(100, (sel.size / Math.max(cap, 1)) * 100)}%` }}
                transition={{ duration: 0.35, ease: EXPO_OUT }}
              />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          {step === 1 && (
            <Button variant="ghost" icon={<ArrowLeft className="size-3.5" />} onClick={() => setStep(0)}>
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button variant="primary" onClick={() => setStep(1)}>
              Continue <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button variant="primary" onClick={commit} disabled={sel.size === 0}>
              Start my day <ArrowRight className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
