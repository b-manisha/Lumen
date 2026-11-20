import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check, CheckCheck, Flame, Moon, Sunset, Timer } from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatMinutes, todayKey } from '../lib/utils'
import { computeStreak } from '../lib/stats'
import { EXPO_OUT } from '../lib/motion'
import { useDayGetter, useTodayTasks } from '../hooks/useDerived'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { Modal } from '../components/Modal'
import { Button } from '../components/ui'

export function Shutdown() {
  const overlay = useUI((s) => s.overlay)
  const close = useUI((s) => s.close)
  return (
    <Modal open={overlay === 'shutdown'} onClose={close} title="Evening shutdown" hideHeader className="w-[min(600px,100%)]">
      <ShutdownBody onDone={close} />
    </Modal>
  )
}

function ShutdownBody({ onDone }: { onDone: () => void }) {
  const { open, doneToday } = useTodayTasks()
  const rollOver = useStore((s) => s.rollOver)
  const markShutdown = useStore((s) => s.markShutdown)
  const journal = useStore((s) => s.journal[todayKey()] ?? '')
  const get = useDayGetter()
  const streak = useMemo(() => computeStreak(get), [get])
  const focus = get(todayKey()).focus
  const [roll, setRoll] = useState<Set<string>>(() => new Set(open.map((t) => t.id)))
  const [note, setNote] = useState(journal)
  const [finished, setFinished] = useState(false)

  const finish = () => {
    rollOver([...roll])
    markShutdown(note)
    setFinished(true)
    toast('Shutdown complete', {
      description: roll.size ? `${roll.size} task${roll.size === 1 ? '' : 's'} moved to tomorrow.` : 'See you tomorrow.',
    })
    window.setTimeout(onDone, 1600)
  }

  return (
    <div className="flex max-h-[min(720px,88vh)] flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EXPO_OUT }}
            className="flex flex-col items-center px-6 py-16 text-center"
          >
            <motion.div
              initial={{ rotate: -30, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              transition={{ duration: 0.8, ease: EXPO_OUT }}
              className="relative"
            >
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(var(--accent-rgb),0.45),transparent)] blur-xl" />
              <Moon className="relative size-12 text-accent" strokeWidth={1.25} style={{ fill: 'rgba(var(--accent-rgb),0.15)' }} />
            </motion.div>
            <div className="display mt-5 text-[22px] text-fg">Day complete</div>
            <p className="mt-1.5 text-[13px] text-muted">Close the laptop. Tomorrow’s list is waiting for you.</p>
          </motion.div>
        ) : (
          <motion.div key="form" className="flex min-h-0 flex-col" exit={{ opacity: 0 }}>
            <div className="relative shrink-0 overflow-hidden border-b border-line px-6 pt-6 pb-5">
              <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(var(--accent-rgb),0.28),transparent)] blur-2xl" />
              <div className="relative flex items-center gap-2 text-xs font-medium text-accent">
                <Sunset className="size-4" /> Evening shutdown
              </div>
              <h2 className="display relative mt-3 text-[22px] text-fg">
                {doneToday.length ? 'Nice work today.' : 'Let’s close the day.'}
              </h2>
              <div className="relative mt-4 grid grid-cols-3 gap-2">
                {[
                  { icon: <CheckCheck />, label: 'Completed', value: String(doneToday.length), color: 'var(--success)' },
                  { icon: <Timer />, label: 'Focused', value: formatMinutes(focus), color: 'var(--accent)' },
                  { icon: <Flame />, label: 'Streak', value: `${streak.current}d`, color: 'var(--warning)' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-row border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-faint [&>svg]:size-3" style={{ color: s.color }}>
                      {s.icon}
                      <span className="text-faint">{s.label}</span>
                    </div>
                    <div className="display tnum mt-1 text-[20px] text-fg">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {doneToday.length > 0 && (
                <section className="mb-5">
                  <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Shipped today</div>
                  <div className="flex flex-col gap-1">
                    {doneToday.map((t, i) => (
                      <motion.div
                        key={t.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.3, ease: EXPO_OUT }}
                        className="flex items-center gap-2.5 text-[13px] text-muted"
                      >
                        <span className="flex size-4 items-center justify-center rounded-full bg-success/15 text-success">
                          <Check className="size-2.5" strokeWidth={3} />
                        </span>
                        <span className="truncate">{t.title}</span>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {open.length > 0 && (
                <section className="mb-5">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium tracking-wide text-faint uppercase">
                    Roll over to tomorrow
                    <button
                      className="normal-case tracking-normal text-muted hover:text-fg"
                      onClick={() => setRoll(roll.size === open.length ? new Set() : new Set(open.map((t) => t.id)))}
                    >
                      {roll.size === open.length ? 'None' : 'All'}
                    </button>
                  </div>
                  <div className="flex flex-col">
                    {open.map((t) => {
                      const on = roll.has(t.id)
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            const n = new Set(roll)
                            if (on) n.delete(t.id)
                            else n.add(t.id)
                            setRoll(n)
                          }}
                          className="flex items-center gap-2.5 rounded-ctl px-1.5 py-1.5 text-left text-[13px] hover:bg-surface-hover"
                        >
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                              on ? 'border-accent bg-accent text-white' : 'border-line-strong',
                            )}
                          >
                            {on && <ArrowRight className="size-2.5" strokeWidth={3} />}
                          </span>
                          <span className={cn('truncate', on ? 'text-fg' : 'text-faint')}>{t.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Reflection</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What went well? What’s on your mind for tomorrow?"
                  className="min-h-[96px] w-full resize-none rounded-row border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-3 text-[13px] leading-relaxed text-fg outline-none placeholder:text-faint focus:border-[rgba(var(--accent-rgb),0.55)]"
                />
              </section>
            </div>

            <div className="flex shrink-0 items-center justify-between border-t border-line px-5 py-3.5">
              <span className="text-xs text-faint">{roll.size ? `${roll.size} moving to tomorrow` : 'Nothing to carry over'}</span>
              <Button variant="primary" icon={<Moon className="size-3.5" />} onClick={finish}>
                Shut down
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
