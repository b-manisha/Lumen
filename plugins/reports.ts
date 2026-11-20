/**
 * Writes the human-readable agent reports under piles/reports/ (node only; used by the dev bridge in
 * plugins/piles.ts and by scripts/run-report.ts / scripts/sim-run.ts).
 *
 *   piles/reports/YYYY-MM-DD/<taskId>-<slug>.md   one per agent result (header, report sections, deliverable)
 *   piles/reports/YYYY-MM-DD/run-HHMM.md          one per run (every task, outcome, time, what came back to you)
 *
 * All writes are atomic (temp file + rename).
 */
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  normalizeHire,
  normalizeReport,
  runReportPath,
  runSummaryMarkdown,
  taskReportMarkdown,
  taskReportPath,
  type HireOutput,
  type ReportDoc,
  type RunLike,
} from '../src/lib/reportMd.ts'

async function writeAtomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, content)
  await rename(tmp, file)
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Task titles from run.json and queue.json (the result file itself has no title). */
async function titleLookup(root: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const queue = await readJson(path.join(root, 'queue.json'))
  if (isObj(queue) && Array.isArray(queue.tasks)) for (const t of queue.tasks) if (isObj(t) && typeof t.id === 'string') titles.set(t.id, String(t.title ?? ''))
  const run = await readJson(path.join(root, 'run.json'))
  if (isObj(run) && Array.isArray(run.tasks))
    for (const t of run.tasks) if (isObj(t) && typeof t.taskId === 'string' && t.title && !String(t.title).startsWith('Task ')) titles.set(t.taskId, String(t.title))
  return titles
}

const SAFE_ID = /^[\w-]+$/

export interface TeamPlan {
  taskId: string
  rationale: string
  hires: { hireId: string; role: 'senior' | 'junior'; title: string; brief: string; deliverable: string; dependsOn?: string[] }[]
  /** mtime of piles/teams/<taskId>.json */
  at: number
}

/** The Manager's staffing plan: piles/teams/<taskId>.json */
export async function readTeamPlan(root: string, taskId: string): Promise<TeamPlan | null> {
  if (!SAFE_ID.test(taskId)) return null
  const file = path.join(root, 'teams', `${taskId}.json`)
  const raw = await readJson(file)
  if (!isObj(raw) || !Array.isArray(raw.hires)) return null
  const at = (await stat(file).catch(() => null))?.mtimeMs ?? 0
  return {
    taskId,
    rationale: String(raw.rationale ?? ''),
    at,
    hires: raw.hires
      .filter(isObj)
      .filter((h) => typeof h.hireId === 'string' && SAFE_ID.test(h.hireId))
      .slice(0, 4)
      .map((h) => ({
        hireId: String(h.hireId),
        role: h.role === 'senior' ? 'senior' : 'junior',
        title: String(h.title ?? (h.role === 'senior' ? 'Senior agent' : 'Junior agent')),
        brief: String(h.brief ?? ''),
        deliverable: String(h.deliverable ?? ''),
        dependsOn: Array.isArray(h.dependsOn) ? h.dependsOn.map(String) : undefined,
      })),
  }
}

/** Outputs the hires wrote to piles/teams/<taskId>/<hireId>.json (only those newer than `since`). */
export async function readHires(root: string, taskId: string, since = 0): Promise<HireOutput[]> {
  const plan = await readTeamPlan(root, taskId)
  if (!plan || plan.at < since) return []
  const out: HireOutput[] = []
  for (const h of plan.hires) {
    const file = path.join(root, 'teams', taskId, `${h.hireId}.json`)
    const st = await stat(file).catch(() => null)
    if (!st || st.mtimeMs < since) continue
    const hire = normalizeHire(await readJson(file), h)
    if (hire) out.push(hire)
  }
  return out
}

export function toDoc(data: Record<string, unknown>, title: string, runId?: string, hires?: HireOutput[]): ReportDoc {
  return {
    taskId: String(data.taskId),
    title: title || String(data.taskId),
    by: String(data.by ?? 'manager'),
    status: String(data.status ?? 'review'),
    owner: typeof data.owner === 'string' ? data.owner : undefined,
    runId,
    output: typeof data.output === 'string' ? data.output : undefined,
    note: typeof data.note === 'string' ? data.note : undefined,
    report: normalizeReport(data.report),
    hires: hires?.length ? hires : undefined,
  }
}

/** Write piles/reports/<day>/<taskId>-<slug>.md for one result. Returns the path relative to piles/. */
export async function writeTaskReport(
  root: string,
  data: Record<string, unknown>,
  opts: { title?: string; runId?: string; since?: number } = {},
): Promise<string | null> {
  if (typeof data.taskId !== 'string' || data.status === 'working') return null
  const title = opts.title || (await titleLookup(root)).get(data.taskId) || data.taskId
  const doc = toDoc(data, title, opts.runId, await readHires(root, data.taskId, opts.since))
  const rel = taskReportPath(doc)
  await writeAtomic(path.join(root, rel), taskReportMarkdown(doc))
  return rel
}

/** The newest result for each task of `run`: pending in results/ or already moved to results/processed/. */
export async function collectRunDocs(root: string, run: RunLike): Promise<ReportDoc[]> {
  const titles = await titleLookup(root)
  const start = Date.parse(run.startedAt)
  const resultsDir = path.join(root, 'results')
  const processedDir = path.join(resultsDir, 'processed')
  const processed = await readdir(processedDir).catch(() => [] as string[])
  const docs: ReportDoc[] = []
  for (const t of run.tasks) {
    const candidates = [path.join(resultsDir, `${t.taskId}.json`), ...processed.filter((f) => f.startsWith(`${t.taskId}.`) && f.endsWith('.json')).map((f) => path.join(processedDir, f))]
    let best: { data: Record<string, unknown>; at: number } | null = null
    for (const file of candidates) {
      const st = await stat(file).catch(() => null)
      // a result older than the run belongs to an earlier run
      if (!st || st.mtimeMs < start - 60_000) continue
      const data = await readJson(file)
      if (!isObj(data) || data.taskId !== t.taskId || data.status === 'working') continue
      if (!best || st.mtimeMs > best.at) best = { data, at: st.mtimeMs }
    }
    if (best) docs.push(toDoc(best.data, titles.get(t.taskId) || t.title, run.runId, await readHires(root, t.taskId, start - 60_000)))
  }
  return docs
}

/** (Re)write the run summary and every task report of the run. Returns the summary path relative to piles/. */
export async function writeRunReports(root: string, run: RunLike): Promise<{ summary: string; tasks: string[] }> {
  const docs = await collectRunDocs(root, run)
  const tasks: string[] = []
  for (const d of docs) {
    const rel = taskReportPath(d)
    await writeAtomic(path.join(root, rel), taskReportMarkdown(d))
    tasks.push(rel)
  }
  const summary = runReportPath(run)
  await writeAtomic(path.join(root, summary), runSummaryMarkdown(run, docs))
  return { summary, tasks }
}

export async function readRun(root: string): Promise<RunLike | null> {
  const raw = await readJson(path.join(root, 'run.json'))
  if (!isObj(raw) || typeof raw.runId !== 'string' || Number.isNaN(Date.parse(String(raw.startedAt)))) return null
  return {
    runId: raw.runId,
    startedAt: String(raw.startedAt),
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : undefined,
    state: String(raw.state ?? 'running'),
    trigger: String(raw.trigger ?? 'manual'),
    tasks: (Array.isArray(raw.tasks) ? raw.tasks : [])
      .filter(isObj)
      .filter((t) => typeof t.taskId === 'string')
      .map((t) => ({ taskId: String(t.taskId), title: String(t.title ?? ''), by: String(t.by ?? 'manager') })),
  }
}
