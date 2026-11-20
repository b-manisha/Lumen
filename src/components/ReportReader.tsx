/**
 * Wide reader panel for agent reports (Reports view, status bar → run summary).
 * Offers "Copy as markdown" and "Download .md" with the same markdown the bridge writes to piles/reports/.
 */
import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import type { StoredReport, Task } from '../lib/types'
import { dayKeyOf, slugify, taskReportMarkdown } from '../lib/reportMd'
import { BRIDGE_AVAILABLE } from '../lib/bridge'
import { useStore } from '../store/useStore'
import { useUI, type ReaderTarget } from '../store/useUI'
import { Modal } from './Modal'
import { Markdown } from './Markdown'
import { AgentReportView } from './AgentReport'
import { OwnerGlyph } from './Owner'
import { roleMeta } from './ownerMeta'
import { Button } from './ui'

function reportMarkdown(task: Pick<Task, 'id' | 'title'>, r: StoredReport) {
  return taskReportMarkdown({
    taskId: task.id,
    title: task.title,
    by: r.by,
    status: r.status === 'handed' ? 'review' : r.status,
    owner: r.status === 'handed' ? 'junior' : r.status === 'returned' ? 'human' : undefined,
    runId: r.runId,
    output: r.output,
    note: r.note,
    report: r.report,
    hires: r.hires,
  })
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Clipboard API, falling back to a hidden textarea where the API is blocked (embedded browsers, http). */
function copy(content: string) {
  const fallback = () => {
    const ta = document.createElement('textarea')
    ta.value = content
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
    if (ok) toast('Copied as markdown', { duration: 1600 })
    else toast.error('Couldn’t copy', { description: 'Use Download .md instead.' })
  }
  if (!navigator.clipboard) return fallback()
  navigator.clipboard.writeText(content).then(() => toast('Copied as markdown', { duration: 1600 }), fallback)
}

export function ReportReader() {
  const reader = useUI((s) => s.reader)
  const openReader = useUI((s) => s.openReader)
  return (
    <Modal open={!!reader} onClose={() => openReader(null)} title="Report" hideHeader className="h-[min(860px,100%)] w-[min(880px,100%)]">
      {reader?.kind === 'report' && <TaskReportBody key={reader.reportId} target={reader} />}
      {reader?.kind === 'run' && <RunSummaryBody key={reader.startedAt} target={reader} />}
    </Modal>
  )
}

function Header({ title, sub, md, file, icon }: { title: string; sub: React.ReactNode; md: string; file: string; icon?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      {icon}
      <div className="min-w-[220px] flex-1">
        <Dialog.Title className="display text-[17px] leading-tight text-pretty text-fg">{title}</Dialog.Title>
        <div className="tnum mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-faint">{sub}</div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="secondary" icon={<Copy className="size-3.5" />} onClick={() => copy(md)} disabled={!md}>
          <span className="hidden sm:inline">Copy as markdown</span>
          <span className="sm:hidden">Copy</span>
        </Button>
        <Button size="sm" variant="secondary" icon={<Download className="size-3.5" />} onClick={() => download(file, md)} disabled={!md}>
          <span className="hidden sm:inline">Download .md</span>
          <span className="sm:hidden">.md</span>
        </Button>
        <Dialog.Close className="press inline-flex size-7 items-center justify-center rounded-ctl text-faint hover:bg-surface-hover hover:text-fg" aria-label="Close">
          <X className="size-4" />
        </Dialog.Close>
      </div>
    </div>
  )
}

function TaskReportBody({ target }: { target: Extract<ReaderTarget, { kind: 'report' }> }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === target.taskId))
  const entry = task?.reports?.find((r) => r.id === target.reportId)
  const md = useMemo(() => (task && entry ? reportMarkdown(task, entry) : ''), [task, entry])
  if (!task || !entry) return <div className="p-8 text-center text-sm text-faint">This report is no longer available.</div>
  const when = new Date(entry.report.finishedAt || entry.receivedAt)
  const file = `${dayKeyOf(when)}-${slugify(task.title)}.md`
  return (
    <>
      <Header
        title={task.title}
        icon={<OwnerGlyph owner={entry.by} size={28} tip={null} className="mt-0.5" />}
        md={md}
        file={file}
        sub={
          <>
            <span>{roleMeta(entry.by).label}</span>
            <span>·</span>
            <span>{when.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
            <span>·</span>
            <span>{entry.status === 'returned' ? 'Returned to you' : entry.status === 'handed' ? 'Handed to Junior' : 'Delivered for review'}</span>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <AgentReportView report={entry.report} by={entry.by} hires={entry.hires} />
        <section className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Deliverable</h3>
          <Markdown source={entry.output || '_No deliverable._'} />
        </section>
      </div>
    </>
  )
}

function RunSummaryBody({ target }: { target: Extract<ReaderTarget, { kind: 'run' }> }) {
  const [state, setState] = useState<{ md: string; path: string } | 'loading' | 'missing'>(BRIDGE_AVAILABLE ? 'loading' : 'missing')
  useEffect(() => {
    if (!BRIDGE_AVAILABLE) return
    let alive = true
    fetch(`/api/piles/reports/run?startedAt=${encodeURIComponent(target.startedAt)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { markdown: string; path: string }) => alive && setState({ md: d.markdown, path: d.path }))
      .catch(() => alive && setState('missing'))
    return () => {
      alive = false
    }
  }, [target.startedAt])
  const started = new Date(target.startedAt)
  const md = typeof state === 'object' ? state.md : ''
  return (
    <>
      <Header
        title={`Agent run · ${started.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
        md={md}
        file={`run-${dayKeyOf(started)}-${String(started.getHours()).padStart(2, '0')}${String(started.getMinutes()).padStart(2, '0')}.md`}
        sub={typeof state === 'object' ? <code className="font-mono text-[11px]">{state.path}</code> : 'Run summary'}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {state === 'loading' ? (
          <div className="space-y-2">
            {[70, 90, 60, 80].map((w, i) => (
              <div key={i} className="h-3 animate-pulse rounded bg-surface-hover" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : state === 'missing' ? (
          <p className="py-8 text-center text-[12.5px] text-faint">
            No summary for this run. It is written to <code className="font-mono">piles/reports/</code> when a run ends, while the dev bridge is running.
          </p>
        ) : (
          <Markdown source={state.md.replace(/^# .*\n/, '')} />
        )}
      </div>
    </>
  )
}
