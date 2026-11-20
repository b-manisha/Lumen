import { useMemo } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, Inbox, Users } from 'lucide-react'
import type { Owner } from '../lib/types'
import { cn, isOpen } from '../lib/utils'
import { EXPO_OUT } from '../lib/motion'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { useBridge } from '../lib/bridge'
import { Button, Card, CardHeader } from './ui'
import { CountUp } from './CountUp'
import { OWNER_META, OwnerAvatar } from './Owner'

const PILES: Owner[] = ['human', 'manager', 'junior']

/** Dashboard tile: open tasks per pile, outputs awaiting review, and the split as one bar. */
export function DelegationWidget() {
  const tasks = useStore((s) => s.tasks)
  const setView = useUI((s) => s.setView)
  const bridge = useBridge((s) => s.status)

  const stats = useMemo(() => {
    const open = tasks.filter(isOpen)
    const count: Record<Owner, number> = { human: 0, manager: 0, junior: 0 }
    const working: Record<Owner, number> = { human: 0, manager: 0, junior: 0 }
    let review = 0
    let returned = 0
    for (const t of open) {
      count[t.owner]++
      if (t.agent?.status === 'working') working[t.owner]++
      if (t.agent?.status === 'review') review++
      if (t.agent?.status === 'returned' && t.owner === 'human') returned++
    }
    const total = open.length || 1
    return { count, working, review, returned, total, delegated: count.manager + count.junior }
  }, [tasks])

  const go = () => setView({ kind: 'delegation' })
  const share = Math.round((stats.delegated / stats.total) * 100)

  return (
    <Card className="p-5">
      <CardHeader
        icon={<Users />}
        title="Delegation"
        sub={
          <span className="tnum">
            {share}% of open work is with agents
            <span className="hidden sm:inline">
              {' · '}
              {bridge === 'connected' ? 'agents connected' : bridge === 'checking' ? 'connecting…' : 'bridge offline'}
            </span>
          </span>
        }
        right={
          <Button size="sm" variant="ghost" onClick={go}>
            Open <ArrowRight className="size-3" />
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {PILES.map((o, i) => {
          const m = OWNER_META[o]
          return (
            <motion.button
              key={o}
              onClick={go}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EXPO_OUT, delay: 0.3 + i * 0.05 }}
              className="press group/pile flex min-w-0 items-center gap-3 rounded-row border border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] p-3 text-left shadow-[inset_0_1px_0_var(--highlight)] hover:border-line-strong"
            >
              <OwnerAvatar owner={o} size={30} />
              <div className="min-w-0">
                <div className="display tnum text-[22px] leading-none text-fg">
                  <CountUp value={stats.count[o]} />
                </div>
                <div className="mt-1 truncate text-[11.5px] text-muted">
                  {o === 'human' ? 'With you' : m.short}
                  {/* secondary detail only where there is room for it */}
                  {stats.working[o] > 0 && <span className="hidden text-info sm:inline"> · {stats.working[o]} working</span>}
                  {o === 'human' && stats.returned > 0 && (
                    <span className="hidden sm:inline" style={{ color: m.color }}>
                      {' '}
                      · {stats.returned} returned
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          )
        })}
        <motion.button
          onClick={go}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EXPO_OUT, delay: 0.45 }}
          className={cn(
            'press flex min-w-0 items-center gap-3 rounded-row border p-3 text-left shadow-[inset_0_1px_0_var(--highlight)]',
            stats.review > 0
              ? 'border-[rgba(var(--accent-rgb),0.4)] bg-[linear-gradient(100deg,rgba(var(--accent-rgb),0.16),rgba(var(--accent-rgb),0.04))] hover:border-[rgba(var(--accent-rgb),0.6)]'
              : 'border-line bg-[color-mix(in_srgb,var(--text)_2%,transparent)] hover:border-line-strong',
          )}
        >
          <span
            className={cn(
              'inline-flex size-[30px] shrink-0 items-center justify-center rounded-[10px] border [&>svg]:size-[15px]',
              stats.review > 0 ? 'glow border-transparent bg-accent text-white' : 'border-line text-faint',
            )}
          >
            <Inbox />
          </span>
          <div className="min-w-0">
            <div className={cn('display tnum text-[22px] leading-none', stats.review > 0 ? 'text-accent' : 'text-fg')}>
              <CountUp value={stats.review} />
            </div>
            <div className="mt-1 truncate text-[11.5px] text-muted">
              <span className="sm:hidden">To review</span>
              <span className="hidden sm:inline">{stats.review > 0 ? 'Awaiting your review' : 'Nothing to review'}</span>
            </div>
          </div>
        </motion.button>
      </div>

      {/* the split as one hairline bar */}
      <div className="mt-4 flex h-1.5 gap-[3px] overflow-hidden rounded-full" aria-hidden>
        {PILES.map((o) =>
          stats.count[o] ? (
            <motion.span
              key={o}
              className="h-full rounded-full"
              style={{ background: OWNER_META[o].color, boxShadow: `0 0 8px -2px ${OWNER_META[o].color}` }}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: stats.count[o] }}
              transition={{ duration: 0.9, ease: EXPO_OUT, delay: 0.35 }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
        {PILES.map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px]" style={{ background: OWNER_META[o].color }} />
            {OWNER_META[o].long}
          </span>
        ))}
      </div>
    </Card>
  )
}
