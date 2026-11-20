/**
 * Rendered agent report (the `report` object of a result): summary, meta, decisions for you,
 * approach timeline, sources, assumptions, risks, handoffs and the Manager's team.
 */
import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, ArrowUpRight, ChevronDown, CircleHelp, Clock3, Cpu, FileText, Forward, Gavel, Lightbulb, ListOrdered, Users } from 'lucide-react'
import type { AgentReport as Report, AgentRole, Confidence, HireOutput, HireQuality, TeamMember } from '../lib/types'
import { formatDuration, reportDuration } from '../lib/reportMd'
import { EXPO_OUT } from '../lib/motion'
import { cn } from '../lib/utils'
import { OwnerAvatar, OwnerGlyph } from './Owner'
import { roleMeta } from './ownerMeta'
import { Markdown } from './Markdown'
import { Tip } from './ui'

const CONF_COLOR: Record<Confidence, string> = { high: 'var(--success)', medium: 'var(--warning)', low: 'var(--danger)' }
const QUALITY_COLOR: Record<HireQuality, string> = { accepted: 'var(--success)', revised: 'var(--info)', rejected: 'var(--danger)' }

function Pill({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-[20px] shrink-0 items-center gap-1.5 rounded-full border px-2 text-[10.5px] font-medium whitespace-nowrap', className)}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` }}
    >
      {children}
    </span>
  )
}

export function ConfidencePill({ confidence, reason }: { confidence: Confidence; reason?: string }) {
  const color = CONF_COLOR[confidence]
  const pill = (
    <Pill color={color} className={reason ? 'cursor-help' : undefined}>
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {confidence[0].toUpperCase() + confidence.slice(1)} confidence
    </Pill>
  )
  return reason ? (
    <Tip content={<span className="block max-w-[280px] text-pretty">{reason}</span>}>
      <span tabIndex={0} className="rounded-full">
        {pill}
      </span>
    </Tip>
  ) : (
    pill
  )
}

export function QualityPill({ quality }: { quality: HireQuality }) {
  return <Pill color={QUALITY_COLOR[quality]}>{quality[0].toUpperCase() + quality.slice(1)}</Pill>
}

function MonoChip({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-[20px] items-center gap-1 rounded-chip border border-line bg-[color-mix(in_srgb,var(--text)_3%,transparent)] px-1.5 font-mono text-[10.5px] text-muted [&>svg]:size-3 [&>svg]:text-faint"
    >
      {icon}
      {children}
    </span>
  )
}

function Section({ icon, title, count, children }: { icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-faint uppercase [&>svg]:size-3.5">
        {icon}
        {title}
        {count != null && <span className="tnum font-mono text-[10.5px] normal-case">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function AgentReportView({ report, by, hires, nested }: { report: Report; by: AgentRole | 'senior'; hires?: HireOutput[]; nested?: boolean }) {
  const dur = reportDuration(report)
  return (
    <div className="text-[13px]">
      {/* summary card */}
      <div
        className="relative overflow-hidden rounded-row border border-line px-3.5 py-3"
        style={{ background: `linear-gradient(180deg, rgba(${roleMeta(by).rgb}, 0.08), transparent 80%), var(--surface)` }}
      >
        <span aria-hidden className="absolute inset-x-6 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(${roleMeta(by).rgb}, 0.5), transparent)` }} />
        <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Summary</div>
        <p className="leading-relaxed text-pretty text-fg">{report.summary}</p>
      </div>

      {/* meta row */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] text-muted">
          <OwnerGlyph owner={by} size={16} tip={null} />
          {roleMeta(by).label}
        </span>
        <MonoChip icon={<Cpu />} title="Model">
          {report.model}
        </MonoChip>
        <MonoChip icon={<Clock3 />} title="Time taken">
          {formatDuration(dur)}
        </MonoChip>
        <ConfidencePill confidence={report.confidence} reason={report.confidenceReason} />
      </div>

      {report.decisionsForYou.length > 0 && (
        <div
          className="mt-4 rounded-row border px-3.5 py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--cho) 35%, var(--border))',
            background: 'linear-gradient(180deg, color-mix(in srgb, var(--cho) 11%, transparent), color-mix(in srgb, var(--cho) 4%, transparent))',
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--cho) 8%, transparent), 0 10px 28px -18px color-mix(in srgb, var(--cho) 70%, transparent)',
          }}
        >
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--cho)' }}>
            <Gavel className="size-3.5" /> Decisions for you
            <span className="tnum font-mono text-[11px] font-normal opacity-80">{report.decisionsForYou.length}</span>
          </div>
          <ul className="space-y-1.5">
            {report.decisionsForYou.map((d, i) => (
              <li key={i} className="flex gap-2 leading-snug text-fg">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full" style={{ background: 'var(--cho)' }} />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.approach.length > 0 && (
        <Section icon={<ListOrdered />} title="Approach" count={report.approach.length}>
          <ol className="relative">
            {report.approach.map((step, i) => (
              <li key={i} className="relative flex gap-3 pb-2.5 last:pb-0">
                {i < report.approach.length - 1 && <span aria-hidden className="absolute top-[22px] bottom-0 left-[10.5px] w-px bg-line-strong" />}
                <span className="tnum relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full border border-line-strong bg-elevated font-mono text-[10.5px] text-muted">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-snug text-muted">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {report.sources?.length ? (
        <Section icon={<ArrowUpRight />} title="Sources" count={report.sources.length}>
          <div className={cn('grid gap-1.5', !nested && 'sm:grid-cols-2')}>
            {report.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group press block min-w-0 rounded-row border border-line bg-surface px-3 py-2 hover:border-line-strong hover:bg-surface-hover"
              >
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{s.title}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 text-faint transition-transform duration-150 group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-accent" />
                </div>
                <div className="truncate font-mono text-[10.5px] text-faint">{domainOf(s.url)}</div>
                {s.note && <div className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{s.note}</div>}
              </a>
            ))}
          </div>
        </Section>
      ) : null}

      <Section icon={<Lightbulb />} title="Assumptions" count={report.assumptions.length}>
        {report.assumptions.length ? (
          <ul className="space-y-1">
            {report.assumptions.map((a, i) => (
              <li key={i} className="flex gap-2 leading-snug text-muted">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-faint" />
                {a}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-faint">None stated.</p>
        )}
      </Section>

      {report.risks?.length ? (
        <Section icon={<AlertTriangle />} title="Risks" count={report.risks.length}>
          <ul className="space-y-1">
            {report.risks.map((r, i) => (
              <li key={i} className="flex gap-2 leading-snug text-muted">
                <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
                {r}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {report.handoffs?.length ? (
        <Section icon={<Forward />} title="Handoffs" count={report.handoffs.length}>
          <ul className="space-y-1">
            {report.handoffs.map((h, i) => (
              <li key={i} className="flex gap-2 leading-snug text-muted">
                <Forward className="mt-0.5 size-3 shrink-0 text-faint" />
                {h}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!nested && (report.team?.length || report.hiringRationale) ? (
        <Section icon={<Users />} title="Team" count={report.team?.length ?? 0}>
          <TeamTree report={report} hires={hires} />
        </Section>
      ) : null}
    </div>
  )
}

/** Org tree: the Manager on top, its hired Seniors and Juniors below. Click a hire for its own output and report. */
export function TeamTree({ report, hires }: { report: Report; hires?: HireOutput[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const team = report.team ?? []
  return (
    <div>
      <div className="flex items-start gap-2.5 rounded-row border border-line bg-surface px-3 py-2.5">
        <OwnerAvatar owner="manager" size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-fg">Manager agent</span>
            <MonoChip icon={<Cpu />}>{report.model}</MonoChip>
            <span className="tnum font-mono text-[10.5px] text-faint">
              {team.length ? `${team.length} hire${team.length === 1 ? '' : 's'}` : 'worked alone'}
            </span>
          </div>
          {report.hiringRationale && (
            <p className="mt-1 text-[12px] leading-snug text-pretty text-muted">
              <span className="text-faint">Why this team: </span>
              {report.hiringRationale}
            </p>
          )}
        </div>
      </div>
      {team.length > 0 && (
        <ul className="relative mt-0 ml-[26px] border-l border-line-strong pt-2">
          {team.map((m, i) => (
            <li key={m.hireId} className="relative pb-2 pl-4 last:pb-0">
              {/* elbow connector */}
              <span aria-hidden className="absolute top-[18px] left-0 h-px w-3.5 bg-line-strong" />
              {i === team.length - 1 && <span aria-hidden className="absolute top-[19px] -bottom-px -left-px w-px bg-[var(--surface)]" />}
              <HireNode member={m} hire={hires?.find((h) => h.hireId === m.hireId)} open={open === m.hireId} onToggle={() => setOpen(open === m.hireId ? null : m.hireId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HireNode({ member, hire, open, onToggle }: { member: TeamMember; hire?: HireOutput; open: boolean; onToggle: () => void }) {
  const m = roleMeta(member.role)
  const [tab, setTab] = useState<'output' | 'report'>('output')
  return (
    <div
      className={cn('overflow-hidden rounded-row border bg-surface transition-[border-color] duration-150', open ? 'border-line-strong' : 'border-line hover:border-line-strong')}
      style={open ? { borderColor: `rgba(${m.rgb}, 0.35)` } : undefined}
    >
      <button onClick={onToggle} aria-expanded={open} className="press w-full px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <OwnerGlyph owner={member.role} size={18} tip={null} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg">{member.title}</span>
          <QualityPill quality={member.quality} />
          <ChevronDown className={cn('size-3.5 shrink-0 text-faint transition-transform duration-200', open && 'rotate-180')} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[26px]">
          <span className="text-[11px] font-medium" style={{ color: m.color }}>
            {m.short}
          </span>
          <MonoChip icon={<Cpu />}>{member.model}</MonoChip>
          <MonoChip icon={<Clock3 />}>{formatDuration(member.durationSec != null ? member.durationSec * 1000 : undefined)}</MonoChip>
        </div>
        {member.deliverable && <div className="mt-1 pl-[26px] text-[11.5px] leading-snug text-muted">{member.deliverable}</div>}
        {member.note && (
          <div className="mt-1 flex gap-1 pl-[26px] text-[11.5px] leading-snug text-faint">
            <CircleHelp className="mt-px size-3 shrink-0" />
            {member.note}
          </div>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1, transition: { duration: 0.32, ease: EXPO_OUT } }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.18 } }}
            className="overflow-hidden border-t border-line"
          >
            {hire ? (
              <div className="p-3">
                <div className="mb-2.5 inline-flex rounded-ctl border border-line p-0.5">
                  {(['output', 'report'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        'press h-6 rounded-[5px] px-2.5 text-[11px] font-medium',
                        tab === t ? 'bg-surface-hover text-fg shadow-[inset_0_1px_0_var(--highlight),0_0_0_1px_var(--border)]' : 'text-faint hover:text-muted',
                      )}
                    >
                      {t === 'output' ? 'Output' : 'Report'}
                    </button>
                  ))}
                  {hire.revision ? <span className="ml-1.5 self-center pr-1 text-[10.5px] text-info">revised</span> : null}
                </div>
                {tab === 'output' ? (
                  <div className="max-h-[320px] overflow-y-auto">
                    <Markdown source={hire.output || '_No output._'} />
                  </div>
                ) : hire.report ? (
                  <AgentReportView report={hire.report} by={member.role} nested />
                ) : (
                  <NoReport compact />
                )}
              </div>
            ) : (
              <div className="p-3 text-[12px] text-faint">This hire’s output wasn’t kept with the result.</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function NoReport({ compact }: { compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-4' : 'py-8')}>
      <span className="mb-2 flex size-9 items-center justify-center rounded-full border border-line bg-surface text-faint">
        <FileText className="size-4" />
      </span>
      <div className="text-[12.5px] font-medium text-muted">No detailed report for this result</div>
      <p className="mt-0.5 max-w-[280px] text-[11.5px] text-pretty text-faint">It came from an older run, before agents wrote reports. The deliverable is still on the other tab.</p>
    </div>
  )
}
