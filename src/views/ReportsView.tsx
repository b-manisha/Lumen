import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { CalendarClock, FileText, Gavel, Hand, Search, X } from 'lucide-react'
import type { AgentRole, Confidence, StoredReport, Task } from '../lib/types'
import { formatDuration, reportDuration } from '../lib/reportMd'
import { EXPO_OUT } from '../lib/motion'
import { cn } from '../lib/utils'
import { useRun } from '../lib/agentRun'
import { useStore } from '../store/useStore'
import { useUI } from '../store/useUI'
import { ViewHeader } from '../components/ViewHeader'
import { ConfidencePill } from '../components/AgentReport'
import { OwnerGlyph } from '../components/Owner'
import { roleMeta } from '../components/ownerMeta'
import { Button } from '../components/ui'

interface Entry {
  task: Task
  r: StoredReport
  at: number
}

interface Group {
  key: string
  title: string
  sub?: string
  runStartedAt?: string
  entries: Entry[]
}

const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export function ReportsView() {
  const tasks = useStore((s) => s.tasks)
  const openReader = useUI((s) => s.openReader)
  const lastRun = useRun((s) => s.run)
  const [q, setQ] = useState('')
  const [agent, setAgent] = useState<'all' | AgentRole>('all')
  const [conf, setConf] = useState<'all' | Confidence>('all')
  const [decisions, setDecisions] = useState(false)
  const [seniors, setSeniors] = useState(false)

  const all = useMemo<Entry[]>(
    () =>
      tasks
        .flatMap((task) => (task.reports ?? []).map((r) => ({ task, r, at: Date.parse(r.report.finishedAt) || r.receivedAt })))
        .sort((a, b) => b.at - a.at),
    [tasks],
  )

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(({ task, r }) => {
      if (agent !== 'all' && r.by !== agent) return false
      if (conf !== 'all' && r.report.confidence !== conf) return false
      if (decisions && !r.report.decisionsForYou.length) return false
      if (seniors && !r.report.team?.some((m) => m.role === 'senior')) return false
      if (!needle) return true
      return [task.title, r.report.summary, ...r.report.decisionsForYou, ...(r.report.team ?? []).map((m) => m.title)].join(' ').toLowerCase().includes(needle)
    })
  }, [all, q, agent, conf, decisions, seniors])

  // grouped by run (or by day for results without a run record), newest first
  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const e of list) {
      const key = e.r.runId ?? `day-${new Date(e.at).toDateString()}`
      let g = map.get(key)
      if (!g) {
        const start = e.r.runStartedAt ? new Date(e.r.runStartedAt) : new Date(e.at)
        g = e.r.runId
          ? { key, title: `${fmtDay(start)} · ${fmtTime(start)}`, sub: 'Agent run', runStartedAt: e.r.runStartedAt, entries: [] }
          : { key, title: fmtDay(start), sub: 'No run record', entries: [] }
        map.set(key, g)
      }
      g.entries.push(e)
    }
    return [...map.values()]
  }, [list])

  const filtered = q || agent !== 'all' || conf !== 'all' || decisions || seniors
  const open = (e: Entry) => openReader({ kind: 'report', taskId: e.task.id, reportId: e.r.id })

  return (
    <div className="mx-auto w-full max-w-[1100px] pb-16">
      <ViewHeader icon={<FileText />} title="Reports" sub={`${all.length} agent report${all.length === 1 ? '' : 's'} · newest first`}>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-ctl border border-line bg-surface px-2.5 focus-within:border-line-strong">
            <Search className="size-3.5 shrink-0 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search titles, summaries, decisions…"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none"
              aria-label="Search reports"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Clear search" className="text-faint hover:text-fg">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <Seg value={agent} onChange={setAgent} options={[['all', 'All agents'], ['manager', 'Manager'], ['junior', 'Junior']]} />
            <Seg value={conf} onChange={setConf} options={[['all', 'Any confidence'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]} />
            <Toggle on={decisions} onClick={() => setDecisions(!decisions)} icon={<Gavel className="size-3" />} label="Has decisions" />
            <Toggle on={seniors} onClick={() => setSeniors(!seniors)} icon={<span className="size-1.5 rounded-full bg-sr" />} label="Used Seniors" />
          </div>
        </div>
      </ViewHeader>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center">
          <span className="mb-3 flex size-10 items-center justify-center rounded-full border border-line bg-surface text-faint">
            <FileText className="size-4" />
          </span>
          <div className="text-[13.5px] font-medium text-fg">{filtered ? 'No reports match' : 'No agent reports yet'}</div>
          <p className="mt-1 max-w-[340px] text-xs text-pretty text-faint">
            {filtered ? 'Try clearing a filter.' : 'Each agent result now comes with a detailed report. They collect here after the next run.'}
          </p>
          {lastRun?.summaryPath && !filtered && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => openReader({ kind: 'run', startedAt: lastRun.startedAt, runId: lastRun.runId })}>
              Open the last run summary
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g, gi) => (
            <motion.section
              key={g.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EXPO_OUT, delay: Math.min(gi, 6) * 0.04 }}
            >
              <header className="mb-2 flex items-center gap-2 px-1">
                <CalendarClock className="size-3.5 text-faint" />
                <h2 className="tnum min-w-0 truncate text-[12.5px] font-semibold whitespace-nowrap text-fg">{g.title}</h2>
                <span className="hidden text-[11.5px] whitespace-nowrap text-faint sm:inline">· {g.sub}</span>
                <span className="tnum font-mono text-[11px] text-faint">· {g.entries.length}</span>
                {g.runStartedAt && (
                  <button
                    onClick={() => openReader({ kind: 'run', startedAt: g.runStartedAt!, runId: g.key })}
                    className="press ml-auto shrink-0 rounded-ctl px-2 py-1 text-[11.5px] whitespace-nowrap text-accent hover:bg-accent-soft"
                  >
                    Run summary
                  </button>
                )}
              </header>
              <div className="card divide-y divide-[var(--border)] overflow-hidden p-0">
                {g.entries.map((e) => (
                  <Row key={e.r.id} e={e} onOpen={() => open(e)} />
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  )
}

function Row({ e, onOpen }: { e: Entry; onOpen: () => void }) {
  const { task, r } = e
  const dur = reportDuration(r.report)
  const team = r.report.team ?? []
  const dec = r.report.decisionsForYou.length
  return (
    <button onClick={onOpen} className="group flex w-full flex-col gap-1.5 px-3.5 py-3 text-left transition-colors duration-150 hover:bg-surface-hover md:flex-row md:items-center md:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <OwnerGlyph owner={r.by} size={18} tip={roleMeta(r.by).label} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-fg">{task.title}</div>
          <div className="truncate text-[11.5px] text-faint">{r.report.summary}</div>
        </div>
      </div>
      <div className="flex items-center gap-2.5 pl-[28px] md:shrink-0 md:pl-0">
        {r.status === 'returned' && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--cho)' }}>
            <Hand className="size-3" /> Returned
          </span>
        )}
        <TeamBadge team={team} />
        <ConfidencePill confidence={r.report.confidence} />
        <span className="tnum ml-auto text-right font-mono text-[11px] text-muted md:ml-0 md:w-14" title="Time taken">
          {formatDuration(dur)}
        </span>
        <span
          className={cn('tnum inline-flex items-center justify-end gap-1 font-mono text-[11px] md:w-9', dec ? '' : 'text-faint/60')}
          style={dec ? { color: 'var(--cho)' } : undefined}
          title={`${dec} decision${dec === 1 ? '' : 's'} for you`}
        >
          <Gavel className="size-3" />
          {dec}
        </span>
        <span className="tnum hidden w-16 text-right text-[11px] text-faint md:inline">{fmtTime(new Date(e.at))}</span>
      </div>
    </button>
  )
}

/** Stacked avatars of the Manager's hires, plus the team size. */
export function TeamBadge({ team }: { team: { role: 'senior' | 'junior'; title?: string }[] }) {
  if (!team.length) return <span className="text-[11px] text-faint/70 md:w-[58px] md:text-right">Solo</span>
  return (
    <span className="inline-flex items-center gap-1.5 md:w-[58px]" title={team.map((m) => m.title).join(', ')}>
      <span className="flex -space-x-1.5">
        {team.slice(0, 3).map((m, i) => (
          <span key={i} className="rounded-full ring-2 ring-[var(--bg-elevated)]">
            <OwnerGlyph owner={m.role} size={16} tip={null} />
          </span>
        ))}
      </span>
      <span className="tnum font-mono text-[11px] text-muted">{team.length}</span>
    </span>
  )
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex shrink-0 rounded-ctl border border-line p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'press h-6 rounded-[5px] px-2 text-[11.5px] font-medium whitespace-nowrap',
            value === v ? 'bg-surface-hover text-fg shadow-[inset_0_1px_0_var(--highlight),0_0_0_1px_var(--border)]' : 'text-faint hover:text-muted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'press inline-flex h-7 shrink-0 items-center gap-1.5 rounded-ctl border px-2 text-[11.5px] font-medium whitespace-nowrap',
        on ? 'border-[rgba(var(--accent-rgb),0.45)] bg-accent-soft text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
