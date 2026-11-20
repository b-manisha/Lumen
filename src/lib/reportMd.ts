/**
 * Agent reports: types, validation and markdown rendering.
 *
 * Shared by the app (src/), the dev bridge (plugins/piles.ts) and the scripts (scripts/), so this file
 * must stay dependency-free (no imports) and use only erasable TypeScript syntax.
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface ReportSource {
  title: string
  url: string
  note?: string
}

export type HireRole = 'senior' | 'junior'
export type HireQuality = 'accepted' | 'revised' | 'rejected'

/** One hire on a Manager's team, as recorded in the Manager's final report. */
export interface TeamMember {
  hireId: string
  role: HireRole
  /** e.g. "Senior research analyst" */
  title: string
  model: string
  /** what the hire was asked to deliver */
  deliverable: string
  durationSec?: number
  quality: HireQuality
  note?: string
}

/** A hire's own output: piles/teams/<taskId>/<hireId>.json (title/brief merged in from the staffing plan). */
export interface HireOutput {
  hireId: string
  role: HireRole
  title?: string
  output: string
  report?: AgentReport
  startedAt?: string
  finishedAt?: string
  /** 1 when the hire did a revision round */
  revision?: number
}

/** The detailed report an agent writes next to its deliverable (`report` in piles/results/<taskId>.json). */
export interface AgentReport {
  /** 2–3 sentences: what was asked, what was done, the outcome */
  summary: string
  /** the steps the agent actually took, in order */
  approach: string[]
  /** only URLs actually consulted */
  sources?: ReportSource[]
  assumptions: string[]
  /** open questions / things the CHO must decide or do */
  decisionsForYou: string[]
  /** caveats, conflicting info, what could be wrong */
  risks?: string[]
  confidence: Confidence
  confidenceReason: string
  /** e.g. "opus", "sonnet" */
  model: string
  /** ISO */
  startedAt: string
  /** ISO */
  finishedAt: string
  /** e.g. "Handed drafting of the FAQ to Junior" */
  handoffs?: string[]
  /** Manager only: the Seniors/Juniors it hired for this task */
  team?: TeamMember[]
  /** Manager only: why it hired (or didn't hire) this team */
  hiringRationale?: string
}

export const REQUIRED_REPORT_FIELDS = [
  'summary',
  'approach',
  'assumptions',
  'decisionsForYou',
  'confidence',
  'confidenceReason',
  'model',
  'startedAt',
  'finishedAt',
] as const

const CONFIDENCE: Confidence[] = ['high', 'medium', 'low']
const QUALITY: HireQuality[] = ['accepted', 'revised', 'rejected']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v: unknown, max = 40) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 1200))
    .filter(Boolean)
    .slice(0, max)
const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v))

/** Names of required report fields that are missing or the wrong type (empty list = valid). */
export function reportProblems(raw: unknown): string[] {
  if (!isObj(raw)) return ['report']
  const bad: string[] = []
  for (const k of REQUIRED_REPORT_FIELDS) {
    const v = raw[k]
    if (k === 'approach' || k === 'assumptions' || k === 'decisionsForYou') {
      if (!Array.isArray(v)) bad.push(k)
    } else if (k === 'confidence') {
      if (!CONFIDENCE.includes(v as Confidence)) bad.push(k)
    } else if (k === 'startedAt' || k === 'finishedAt') {
      if (!isIso(v)) bad.push(k)
    } else if (!str(v)) bad.push(k)
  }
  return bad
}

/** Lenient clean-up of a report from disk. Returns undefined when there is no usable report at all. */
export function normalizeReport(raw: unknown): AgentReport | undefined {
  if (!isObj(raw) || !str(raw.summary)) return undefined
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .filter(isObj)
    .map((s) => ({ title: str(s.title, 300) || str(s.url, 300), url: str(s.url, 2000), note: str(s.note, 600) || undefined }))
    .filter((s) => /^https?:\/\//i.test(s.url))
    .slice(0, 40)
  const risks = strList(raw.risks)
  const handoffs = strList(raw.handoffs)
  const team = (Array.isArray(raw.team) ? raw.team : [])
    .filter(isObj)
    .map(
      (m, i): TeamMember => ({
        hireId: str(m.hireId, 60) || `h${i + 1}`,
        role: m.role === 'senior' ? 'senior' : 'junior',
        title: str(m.title, 120) || (m.role === 'senior' ? 'Senior agent' : 'Junior agent'),
        model: str(m.model, 60) || 'unknown',
        deliverable: str(m.deliverable, 600),
        durationSec: typeof m.durationSec === 'number' && m.durationSec >= 0 ? Math.round(m.durationSec) : undefined,
        quality: QUALITY.includes(m.quality as HireQuality) ? (m.quality as HireQuality) : 'accepted',
        note: str(m.note, 600) || undefined,
      }),
    )
    .slice(0, 8)
  return {
    summary: str(raw.summary),
    approach: strList(raw.approach),
    sources: sources.length ? sources : undefined,
    assumptions: strList(raw.assumptions),
    decisionsForYou: strList(raw.decisionsForYou),
    risks: risks.length ? risks : undefined,
    confidence: CONFIDENCE.includes(raw.confidence as Confidence) ? (raw.confidence as Confidence) : 'medium',
    confidenceReason: str(raw.confidenceReason, 600),
    model: str(raw.model, 60) || 'unknown',
    startedAt: isIso(raw.startedAt) ? String(raw.startedAt) : '',
    finishedAt: isIso(raw.finishedAt) ? String(raw.finishedAt) : '',
    handoffs: handoffs.length ? handoffs : undefined,
    team: team.length ? team : undefined,
    hiringRationale: str(raw.hiringRationale, 1200) || undefined,
  }
}

export function normalizeHire(raw: unknown, plan?: { title?: string; role?: string }): HireOutput | undefined {
  if (!isObj(raw) || !str(raw.hireId, 60)) return undefined
  return {
    hireId: str(raw.hireId, 60),
    role: (raw.role ?? plan?.role) === 'senior' ? 'senior' : 'junior',
    title: plan?.title || str(raw.title, 120) || undefined,
    output: str(raw.output, 100_000),
    report: normalizeReport(raw.report),
    startedAt: isIso(raw.startedAt) ? String(raw.startedAt) : undefined,
    finishedAt: isIso(raw.finishedAt) ? String(raw.finishedAt) : undefined,
    revision: typeof raw.revision === 'number' ? raw.revision : undefined,
  }
}

export function reportDuration(r: Pick<AgentReport, 'startedAt' | 'finishedAt'>): number | undefined {
  const a = Date.parse(r.startedAt)
  const b = Date.parse(r.finishedAt)
  return Number.isNaN(a) || Number.isNaN(b) || b < a ? undefined : b - a
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function slugify(s: string, max = 48): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/g, '') || 'task'
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Local `YYYY-MM-DD` */
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** Local `HHMM` */
export const hhmmOf = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}`

function when(iso: string | undefined) {
  if (!iso || Number.isNaN(Date.parse(iso))) return '—'
  const d = new Date(iso)
  return `${dayKeyOf(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const AGENT_NAME: Record<string, string> = { manager: 'Manager agent', junior: 'Junior agent', senior: 'Senior agent' }
const OUTCOME: Record<string, string> = { review: 'Ready for review', returned: 'Returned to you', working: 'Working', handed: 'Handed to Junior' }

/** One task's result as written to piles/results/<taskId>.json, plus context for rendering. */
export interface ReportDoc {
  taskId: string
  title: string
  by: string
  status: string
  owner?: string
  runId?: string
  output?: string
  note?: string
  report?: AgentReport
  /** outputs of the Manager's hires, if any */
  hires?: HireOutput[]
}

export const outcomeOf = (d: Pick<ReportDoc, 'status' | 'owner' | 'by'>) =>
  d.status === 'review' && d.owner && d.owner !== d.by && d.owner !== 'human' ? 'handed' : d.owner === 'human' ? 'returned' : d.status

const bullets = (items: string[] | undefined, empty = '_None._') => (items?.length ? items.map((x) => `- ${x}`).join('\n') : empty)

/** Path of a task's markdown report, relative to piles/. */
export function taskReportPath(doc: Pick<ReportDoc, 'taskId' | 'title' | 'report'>, fallbackDate = new Date()): string {
  const iso = doc.report?.finishedAt
  const d = iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso) : fallbackDate
  return `reports/${dayKeyOf(d)}/${doc.taskId}-${slugify(doc.title)}.md`
}

/** Path of a run's summary report, relative to piles/. */
export function runReportPath(run: { startedAt: string }): string {
  const d = new Date(run.startedAt)
  return `reports/${dayKeyOf(d)}/run-${hhmmOf(d)}.md`
}

/** Human-readable report for one task: header, every report section, then the full deliverable. */
export function taskReportMarkdown(doc: ReportDoc): string {
  const r = doc.report
  const agent = AGENT_NAME[doc.by] ?? doc.by
  const lines: string[] = [`# ${doc.title}`, '']
  const meta: [string, string][] = [
    ['Task', `\`${doc.taskId}\``],
    ['Agent', agent],
    ['Model', r?.model ?? '—'],
    ['Outcome', OUTCOME[outcomeOf(doc)] ?? doc.status],
    ['Run', doc.runId ? `\`${doc.runId}\`` : '—'],
    ['Started', when(r?.startedAt)],
    ['Finished', when(r?.finishedAt)],
    ['Duration', formatDuration(r ? reportDuration(r) : undefined)],
    ['Confidence', r ? `${r.confidence}${r.confidenceReason ? ` (${r.confidenceReason})` : ''}` : '—'],
  ]
  lines.push('| | |', '|---|---|', ...meta.map(([k, v]) => `| **${k}** | ${v.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`), '')
  if (doc.note) lines.push(`> **Note from the agent:** ${doc.note.replace(/\n/g, ' ')}`, '')
  if (r) {
    lines.push('## Summary', '', r.summary, '')
    lines.push('## Approach', '', r.approach.length ? r.approach.map((s, i) => `${i + 1}. ${s}`).join('\n') : '_Not recorded._', '')
    lines.push(
      '## Sources',
      '',
      r.sources?.length ? r.sources.map((s) => `- [${s.title.replace(/[[\]]/g, '')}](${s.url})${s.note ? `: ${s.note}` : ''}`).join('\n') : '_No external sources consulted._',
      '',
    )
    lines.push('## Assumptions', '', bullets(r.assumptions), '')
    lines.push('## Decisions for you', '', bullets(r.decisionsForYou, '_Nothing to decide._'), '')
    lines.push('## Risks', '', bullets(r.risks), '')
    if (r.handoffs?.length) lines.push('## Handoffs', '', bullets(r.handoffs), '')
    if (r.team?.length || r.hiringRationale) {
      lines.push('## Team', '')
      if (r.hiringRationale) lines.push(`**Hiring rationale:** ${r.hiringRationale}`, '')
      if (r.team?.length) {
        lines.push(
          '| Hire | Role | Model | Deliverable | Time | Quality | Note |',
          '|---|---|---|---|---|---|---|',
          ...r.team.map((m) =>
            [
              `${m.title} (\`${m.hireId}\`)`,
              m.role === 'senior' ? 'Senior' : 'Junior',
              m.model,
              m.deliverable,
              formatDuration(m.durationSec != null ? m.durationSec * 1000 : undefined),
              m.quality,
              m.note ?? '',
            ]
              .map((c) => c.replace(/\|/g, '\\|').replace(/\n/g, ' '))
              .join(' | ')
              .replace(/^/, '| ')
              .concat(' |'),
          ),
          '',
        )
      } else lines.push('_No hires: the Manager did this one alone._', '')
    }
  } else {
    lines.push('_No detailed report for this result._', '')
  }
  lines.push('---', '', '## Deliverable', '', doc.output?.trim() || '_No deliverable._', '')
  if (doc.hires?.length) {
    lines.push('---', '', '## Team outputs', '')
    for (const h of doc.hires) {
      lines.push(`### ${h.title ?? h.hireId} · ${h.role === 'senior' ? 'Senior' : 'Junior'}${h.revision ? ' (revised)' : ''}`, '')
      if (h.report?.summary) lines.push(`> ${h.report.summary.replace(/\n/g, ' ')}`, '')
      lines.push(h.output.trim() || '_No output._', '')
    }
  }
  return lines.join('\n')
}

export interface RunLike {
  runId: string
  startedAt: string
  finishedAt?: string
  state: string
  trigger: string
  tasks: { taskId: string; title: string; by: string }[]
}

/** Summary of a whole run: every task with its outcome and time taken, and what came back to the human. */
export function runSummaryMarkdown(run: RunLike, docs: ReportDoc[]): string {
  const byId = new Map(docs.map((d) => [d.taskId, d]))
  const start = Date.parse(run.startedAt)
  const end = run.finishedAt ? Date.parse(run.finishedAt) : NaN
  const rows = run.tasks.map((t) => {
    const d = byId.get(t.taskId)
    const outcome = d ? (OUTCOME[outcomeOf(d)] ?? d.status) : run.state === 'running' ? 'In progress' : 'No result'
    const dur = d?.report ? formatDuration(reportDuration(d.report)) : '—'
    const conf = d?.report?.confidence ?? '—'
    const decisions = d?.report?.decisionsForYou.length ?? 0
    const team = d?.report?.team?.length ?? 0
    const file = d ? taskReportPath({ taskId: t.taskId, title: d.title || t.title, report: d.report }, new Date(start)).replace(/^reports\/[^/]+\//, '') : ''
    const title = (d?.title || t.title).replace(/\|/g, '\\|')
    return `| ${file ? `[${title}](${file})` : title} | ${AGENT_NAME[t.by] ?? t.by} | ${team ? `${team} hire${team === 1 ? '' : 's'}` : '—'} | ${outcome} | ${dur} | ${conf} | ${decisions} |`
  })
  const counts = { review: 0, returned: 0, handed: 0, missing: 0 }
  for (const t of run.tasks) {
    const d = byId.get(t.taskId)
    if (!d) counts.missing++
    else {
      const o = outcomeOf(d)
      if (o === 'returned') counts.returned++
      else if (o === 'handed') counts.handed++
      else counts.review++
    }
  }
  const returned = run.tasks.map((t) => byId.get(t.taskId)).filter((d): d is ReportDoc => !!d && outcomeOf(d) === 'returned')
  const decisions = run.tasks
    .map((t) => byId.get(t.taskId))
    .filter((d): d is ReportDoc => !!d && !!d.report?.decisionsForYou.length)
  const lines = [
    `# Agent run · ${when(run.startedAt)}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Run** | \`${run.runId}\` |`,
    `| **Trigger** | ${run.trigger === 'scheduled' ? 'Scheduled' : 'Manual'} |`,
    `| **State** | ${run.state} |`,
    `| **Started** | ${when(run.startedAt)} |`,
    `| **Finished** | ${when(run.finishedAt)} |`,
    `| **Duration** | ${formatDuration(Number.isNaN(end) ? undefined : end - start)} |`,
    `| **Outcome** | ${counts.review} ready for review · ${counts.returned} returned to you · ${counts.handed} handed on${counts.missing ? ` · ${counts.missing} without a result` : ''} |`,
    '',
    '## Tasks',
    '',
    '| Task | Agent | Team | Outcome | Time | Confidence | Decisions |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '## Returned to you',
    '',
    returned.length ? returned.map((d) => `- **${d.title}**: ${d.note || 'see the report'}`).join('\n') : '_Nothing came back to you._',
    '',
    '## Decisions for you',
    '',
    decisions.length
      ? decisions.map((d) => `**${d.title}**\n${d.report!.decisionsForYou.map((x) => `- ${x}`).join('\n')}`).join('\n\n')
      : '_No open decisions._',
    '',
  ]
  return lines.join('\n')
}
