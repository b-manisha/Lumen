/**
 * Simulate an agent run for demos and UI work: `npm run sim:run` (with `npm run dev` open in a tab).
 *
 * Writes exactly what the run-piles skill's orchestrator and subagents write:
 *   piles/run.json, piles/status/*.json, piles/teams/<taskId>.json (+ hire outputs), piles/results/*.json
 * and finally the markdown reports under piles/reports/. Over ~45s:
 *   - Manager task 1 plans and hires a Senior analyst and a Junior writer (the Junior waits on the
 *     Senior), sends the Junior back for one revision, then assembles the result;
 *   - Manager task 2 hires nobody and does the work alone;
 *   - one Junior-pile task goes straight to a Junior.
 *
 * Tasks come from piles/queue.json (two queued Manager tasks + one queued Junior task, with their real
 * titles). With no candidates it refuses to start: add test tasks in Lumen (e.g. "… ^mgr", "… ^jr").
 *
 * Options:  --scheduled   mark the run as triggered by the 9:00 / 14:00 schedule
 *           --fast        run in ~15s
 *           --stall       leave Manager task 2 stuck at 50% (status backdated 20 min; run stays "running")
 *           --no-results  progress only; no result files
 *           --ids=a,b,c   use these open task ids (Manager, Manager, Junior); titles from queue.json
 *           --reset       remove everything a previous simulation wrote, then exit (npm run sim:clean)
 *
 * Every file it writes is listed in piles/.sim.json so --reset removes exactly those (plus the copies the
 * dev bridge makes when the app picks the results up). It never touches a real (non-sim) run.
 */
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { writeRunReports } from '../plugins/reports.ts'
import { runReportPath } from '../src/lib/reportMd.ts'

type By = 'manager' | 'junior'
type HireRef = { hireId: string; role: 'senior' | 'junior' }
interface SimTask {
  taskId: string
  title: string
  by: By
}
interface Manifest {
  runId: string
  startedAt: string
  taskIds: string[]
  files: string[]
}

const ROOT = path.resolve(import.meta.dirname, '..', 'piles')
const MANIFEST = path.join(ROOT, '.sim.json')
const args = new Set(process.argv.slice(2))
const SPEED = args.has('--fast') ? 0.33 : 1
let manifest: Manifest | null = null

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function track(file: string) {
  if (manifest && !manifest.files.includes(file)) {
    manifest.files.push(file)
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2))
  }
}

async function writeAtomic(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await track(file)
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n')
  await rename(tmp, file)
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000 * SPEED))
const iso = (ms = Date.now()) => new Date(ms).toISOString()

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

// ── cleanup ──

async function reset(quiet = false) {
  const m = await readJson<Manifest>(MANIFEST)
  const run = await readJson<{ runId?: string; startedAt?: string }>(path.join(ROOT, 'run.json'))
  let removed = 0
  const del = async (f: string) => {
    const there = await stat(f).then(
      () => true,
      () => false,
    )
    if (!there) return
    await rm(f, { recursive: true, force: true })
    removed++
  }
  if (m) {
    for (const f of m.files) await del(f)
    const since = Date.parse(m.startedAt) - 60_000
    // copies the dev bridge made when the app picked the results up, and the reports it wrote
    const processed = path.join(ROOT, 'results', 'processed')
    for (const f of await readdir(processed).catch(() => [] as string[])) {
      const st = await stat(path.join(processed, f)).catch(() => null)
      if (m.taskIds.includes(f.split('.')[0]) && st && st.mtimeMs >= since) await del(path.join(processed, f))
    }
    for (const id of m.taskIds) {
      await del(path.join(ROOT, 'teams', id))
      await del(path.join(ROOT, 'teams', `${id}.json`))
      for (const f of await readdir(path.join(ROOT, 'status')).catch(() => [] as string[]))
        if (f === `${id}.json` || f.startsWith(`${id}.`)) await del(path.join(ROOT, 'status', f))
    }
    const reports = path.join(ROOT, 'reports')
    for (const day of await readdir(reports).catch(() => [] as string[])) {
      for (const f of await readdir(path.join(reports, day)).catch(() => [] as string[])) {
        const st = await stat(path.join(reports, day, f)).catch(() => null)
        if (st && st.mtimeMs >= since && m.taskIds.some((id) => f.startsWith(`${id}-`))) await del(path.join(reports, day, f))
      }
    }
    await del(path.join(ROOT, runReportPath({ startedAt: m.startedAt })))
    // drop folders the simulation left empty
    for (const day of await readdir(reports).catch(() => [] as string[]))
      if (!(await readdir(path.join(reports, day)).catch(() => ['x'])).length) await rm(path.join(reports, day), { recursive: true })
    for (const dir of [path.join(ROOT, 'teams'), reports]) if (!(await readdir(dir).catch(() => ['x'])).length) await rm(dir, { recursive: true })
    await unlink(MANIFEST).catch(() => {})
  }
  // a leftover simulated run.json (also from older versions without a manifest)
  if (run?.runId?.startsWith('sim-')) {
    // its summary report too (run.json's start can differ from the manifest's, e.g. after --stall edits)
    if (run.startedAt && !Number.isNaN(Date.parse(run.startedAt))) await del(path.join(ROOT, runReportPath({ startedAt: run.startedAt })))
    await del(path.join(ROOT, 'run.json'))
  }
  if (!quiet) console.log(removed ? `Removed ${removed} simulation file(s).` : 'Nothing to clean.')
}

// ── task selection ──

interface QueueTask {
  id: string
  title: string
  owner: string
  humanOnly: boolean
  agent: { status: string } | null
}

async function pickTasks(): Promise<SimTask[]> {
  const queue = await readJson<{ tasks: QueueTask[] }>(path.join(ROOT, 'queue.json'))
  const tasks = queue?.tasks ?? []
  const ids = process.argv.find((a) => a.startsWith('--ids='))?.slice(6).split(',').filter(Boolean)
  if (ids?.length) {
    const roles: By[] = ['manager', 'manager', 'junior']
    const picked = ids.slice(0, 3).map((id, i) => {
      const t = tasks.find((x) => x.id === id)
      return t ? { taskId: id, title: t.title, by: roles[i] } : null
    })
    if (picked.length === 3 && picked.every(Boolean)) return picked as SimTask[]
    fail(`--ids needs 3 ids that are open tasks in piles/queue.json (found ${picked.filter(Boolean).length} of ${ids.length}).`)
  }
  const eligible = (owner: By) => tasks.filter((t) => t.owner === owner && !t.humanOnly && (!t.agent || t.agent.status === 'queued'))
  const mgr = eligible('manager').slice(0, 2)
  const jr = eligible('junior').slice(0, 1)
  if (mgr.length < 2 || jr.length < 1)
    fail(
      `Nothing to simulate: need 2 queued Manager tasks and 1 queued Junior task in piles/queue.json (found ${mgr.length} and ${jr.length}).\n` +
        'Add test tasks in Lumen, e.g. "Compare CRM tools ^mgr", "Research desk options ^mgr" and "Draft a launch email ^jr", then re-run.',
    )
  return [...mgr, ...jr].map((t) => ({ taskId: t.id, title: t.title, by: t.owner as By }))
}

// ── content ──

const SRC = (slug: string, title: string, note: string) => ({ title: `${title} (simulated)`, url: `https://example.com/sim/${slug}`, note })

const output = (t: SimTask, extra = '') =>
  `## ${t.title}\n\n_Simulated output from \`npm run sim:run\`. Nothing was researched or sent._\n\n**Recommendation:** go with option A.\n\n| Option | Cost | Fit |\n|---|---|---|\n| A | $$ | Best |\n| B | $ | Good |\n\n${extra}- Next step for you: confirm the choice.`

function teamReport(t: SimTask, started: number, team: unknown[]) {
  return {
    summary: `You asked for “${t.title}”. I split it into research and drafting, hired a Senior analyst for the evidence and a Junior writer for the write-up, reviewed both and assembled one recommendation. The first draft needed one revision.`,
    approach: [
      'Broke the task into two work packages: evidence and analysis, then the written deliverable',
      'Hired a Senior research analyst (opus) and a Junior writer (sonnet) who starts once the analysis is in',
      'Reviewed the Senior’s analysis against the brief and accepted it',
      'Sent the Junior’s first draft back once: too long, and the recommendation was buried',
      'Accepted the revision and assembled the final deliverable',
    ],
    sources: [SRC('benchmarks', 'Industry benchmark summary', 'Comparison baseline'), SRC('pricing', 'Vendor pricing pages', 'Prices as listed today')],
    assumptions: ['Budget is flexible within ±20% of last year', 'You want one recommendation, not a menu of options'],
    decisionsForYou: ['Pick the recommended option or the cheaper runner-up', 'Confirm who signs off on the spend'],
    risks: ['Pricing pages change often; re-check before you commit', 'Two sources disagreed on adoption numbers; the conservative one is used'],
    confidence: 'medium',
    confidenceReason: 'The analysis is solid, but two key numbers come from vendor pages rather than independent sources.',
    model: 'opus',
    startedAt: iso(started),
    finishedAt: iso(),
    team,
    hiringRationale: 'The research needs judgement (a Senior); the write-up is plain drafting (a Junior). Two hires let analysis and drafting overlap at low cost.',
  }
}

function soloReport(t: SimTask, started: number, by: By) {
  const mgr = by === 'manager'
  return {
    summary: `You asked for “${t.title}”. It was small enough to do directly: I gathered the key facts, drafted the deliverable and checked it against the brief.`,
    approach: ['Read the brief and the task notes', mgr ? 'Compared the main options on cost, fit and effort' : 'Outlined the structure', 'Drafted the deliverable', 'Proofread and tightened it'],
    sources: mgr ? [SRC('overview', 'Market overview', 'Background only')] : undefined,
    assumptions: ['The audience is internal', 'One page is enough'],
    decisionsForYou: mgr ? ['Approve the recommended option or ask for a deeper comparison'] : [],
    risks: mgr ? ['Based on public information only'] : undefined,
    confidence: 'high',
    confidenceReason: mgr ? 'Clear-cut options and consistent sources.' : 'Straightforward drafting against a clear brief.',
    model: mgr ? 'opus' : 'sonnet',
    startedAt: iso(started),
    finishedAt: iso(),
    ...(mgr ? { team: [], hiringRationale: 'Small, well-defined task: hiring would have cost more than it saved.' } : {}),
  }
}

// ── the run ──

type Step = [phase: string, percent: number, message: string, seconds: number]

async function status(t: SimTask, phase: string, percent: number, message: string, hire?: HireRef, at = Date.now()) {
  await writeAtomic(path.join(ROOT, 'status', hire ? `${t.taskId}.${hire.hireId}.json` : `${t.taskId}.json`), {
    taskId: t.taskId,
    by: hire ? hire.role : t.by,
    phase,
    percent,
    message,
    updatedAt: iso(at),
    ...(hire ? { parentTaskId: t.taskId, hireId: hire.hireId } : {}),
  })
  console.log(`  ${(hire ? `${hire.role}:${hire.hireId}` : t.by).padEnd(10)} ${t.title.slice(0, 40)} · ${phase} ${percent}%`)
}

async function steps(t: SimTask, list: Step[], hire?: HireRef) {
  for (const [phase, pct, msg, wait] of list) {
    await status(t, phase, pct, msg, hire)
    await sleep(wait)
  }
}

async function result(t: SimTask, report: unknown, out: string) {
  if (args.has('--no-results')) return
  await writeAtomic(path.join(ROOT, 'results', `${t.taskId}.json`), { taskId: t.taskId, status: 'review', by: t.by, output: out, note: 'Simulated run (scripts/sim-run.ts)', report })
  console.log(`  ${t.by.padEnd(10)} ${t.title.slice(0, 40)} · result written`)
}

async function hireOutput(t: SimTask, h: HireRef, started: number, revision?: number) {
  const senior = h.role === 'senior'
  await writeAtomic(path.join(ROOT, 'teams', t.taskId, `${h.hireId}.json`), {
    hireId: h.hireId,
    role: h.role,
    output: senior
      ? '### Analysis\n\n- Option A leads on fit and support\n- Option B is ~30% cheaper but lacks integrations\n- Adoption risk is low for both\n\n_Simulated._'
      : `### Draft${revision ? ' (revised: shorter, recommendation first)' : ''}\n\n**We recommend option A.** It fits best and the price difference is small.\n\n_Simulated._`,
    report: {
      summary: senior ? 'Compared the options on cost, fit and risk and ranked them.' : `Wrote the ${revision ? 'revised ' : ''}one-page recommendation from the Senior’s analysis.`,
      approach: senior ? ['Listed the options', 'Collected pricing and feature data', 'Scored each option'] : ['Read the analysis', 'Drafted the page', ...(revision ? ['Cut it to half and led with the recommendation'] : [])],
      sources: senior ? [SRC('pricing', 'Vendor pricing pages', 'Prices as listed today')] : undefined,
      assumptions: ['Internal audience'],
      decisionsForYou: [],
      confidence: senior ? 'medium' : 'high',
      confidenceReason: senior ? 'Vendor-provided numbers.' : 'Clear brief.',
      model: senior ? 'opus' : 'sonnet',
      startedAt: iso(started),
      finishedAt: iso(),
    },
    startedAt: iso(started),
    finishedAt: iso(),
    ...(revision ? { revision } : {}),
  })
  console.log(`  ${`${h.role}:${h.hireId}`.padEnd(10)} ${t.title.slice(0, 40)} · output written${revision ? ' (revision)' : ''}`)
}

async function teamManager(t: SimTask) {
  const t0 = Date.now()
  await steps(t, [
    ['Planning', 5, 'Reading the brief', 2],
    ['Hiring', 10, 'Writing the staffing plan', 1.5],
  ])
  await writeAtomic(path.join(ROOT, 'teams', `${t.taskId}.json`), {
    taskId: t.taskId,
    rationale: 'Judgement-heavy research for a Senior; the write-up is drafting for a Junior.',
    hires: [
      { hireId: 'h1', role: 'senior', title: 'Senior research analyst', brief: 'Compare the options on cost, fit and risk.', deliverable: 'Ranked comparison with evidence' },
      { hireId: 'h2', role: 'junior', title: 'Junior writer', brief: 'Turn the analysis into a one-page recommendation.', deliverable: 'One-page recommendation', dependsOn: ['h1'] },
    ],
  })
  await status(t, 'Team at work', 15, '2 hires: Senior analyst, Junior writer')
  const senior: HireRef = { hireId: 'h1', role: 'senior' }
  const junior: HireRef = { hireId: 'h2', role: 'junior' }
  const s0 = Date.now()
  await steps(
    t,
    [
      ['Starting', 5, 'Reading the brief', 2],
      ['Researching', 30, 'Collecting pricing and features', 4],
      ['Analysing', 60, 'Scoring 3 options', 4],
      ['Reviewing', 90, 'Checking the numbers', 2],
      ['Finishing', 100, 'Writing the output', 0.5],
    ],
    senior,
  )
  await hireOutput(t, senior, s0)
  const j0 = Date.now()
  await steps(
    t,
    [
      ['Drafting', 20, 'Outlining the page', 3],
      ['Drafting', 60, 'Writing the recommendation', 3],
      ['Finishing', 100, 'Writing the output', 0.5],
    ],
    junior,
  )
  await hireOutput(t, junior, j0)
  await status(t, 'Reviewing', 85, 'Reviewing both outputs')
  await sleep(2.5)
  // one revision round for the Junior (requested by the Manager through the orchestrator)
  await status(t, 'Reviewing', 86, 'Sent the draft back: shorter, recommendation first')
  await steps(
    t,
    [
      ['Revising', 40, 'Cutting it to half', 3],
      ['Revising', 100, 'Writing the revised output', 0.5],
    ],
    junior,
  )
  await hireOutput(t, junior, j0, 1)
  await steps(t, [
    ['Assembling', 92, 'Combining analysis and draft', 2.5],
    ['Finishing', 100, 'Writing the result', 0.5],
  ])
  const team = [
    { hireId: 'h1', role: 'senior', title: 'Senior research analyst', model: 'opus', deliverable: 'Ranked comparison with evidence', durationSec: Math.round((j0 - s0) / 1000), quality: 'accepted', note: 'Thorough; flagged the conflicting adoption numbers.' },
    { hireId: 'h2', role: 'junior', title: 'Junior writer', model: 'sonnet', deliverable: 'One-page recommendation', durationSec: Math.round((Date.now() - j0) / 1000), quality: 'revised', note: 'First draft too long; the revision is tight.' },
  ]
  await result(t, teamReport(t, t0, team), output(t, '> Built from the Senior analyst’s comparison and the Junior writer’s draft.\n\n'))
}

async function soloManager(t: SimTask, stall: boolean) {
  const t0 = Date.now()
  await sleep(1.5)
  await steps(t, [['Planning', 5, 'Reading the brief', 2]])
  await writeAtomic(path.join(ROOT, 'teams', `${t.taskId}.json`), { taskId: t.taskId, rationale: 'Small enough to do alone.', hires: [] })
  await steps(t, [['Researching', 25, 'Gathering the basics', 6]])
  if (stall) {
    await status(t, 'Analysing', 50, 'Comparing options', undefined, Date.now() - 20 * 60 * 1000)
    console.log(`  manager    ${t.title.slice(0, 40)} · left stalled at 50%`)
    return
  }
  await steps(t, [
    ['Analysing', 50, 'Comparing options', 7],
    ['Drafting', 75, 'Writing the recommendation', 6],
    ['Finishing', 100, 'Writing the result', 0.5],
  ])
  await result(t, soloReport(t, t0, 'manager'), output(t))
}

async function juniorTask(t: SimTask) {
  const t0 = Date.now()
  await sleep(3)
  await steps(t, [
    ['Starting', 5, 'Reading the brief', 4],
    ['Outlining', 25, 'Sections and key points', 6],
    ['Drafting', 50, 'First full draft', 8],
    ['Drafting', 75, 'Polishing', 6],
    ['Proofreading', 90, 'Tightening the copy', 4],
    ['Finishing', 100, 'Writing the result', 0.5],
  ])
  await result(t, soloReport(t, t0, 'junior'), output(t))
}

async function main() {
  if (args.has('--reset')) return reset()
  const current = await readJson<{ runId?: string; state?: string }>(path.join(ROOT, 'run.json'))
  if (current?.state === 'running' && !current.runId?.startsWith('sim-')) fail('A real agent run is in progress (piles/run.json). Not simulating over it.')
  const tasks = await pickTasks() // refuses before touching anything when there are no candidates
  await reset(true) // clear an earlier simulation

  const stall = args.has('--stall')
  const runId = `sim-${iso().replace(/[:.]/g, '-')}`
  // --stall backdates one status by 20 min; start the run before that so the bridge doesn't drop it as a leftover
  const startedAt = iso(Date.now() - (stall ? 25 * 60 * 1000 : 0))
  manifest = { runId, startedAt, taskIds: tasks.map((t) => t.taskId), files: [] }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2))
  const trigger = args.has('--scheduled') ? 'scheduled' : 'manual'
  const run = { runId, startedAt, state: 'running', trigger, total: tasks.length, tasks }
  const runFile = path.join(ROOT, 'run.json')
  await writeAtomic(runFile, run)
  console.log(`▶ ${runId} (${trigger}) · ${tasks.map((t) => `${t.by}: ${t.title}`).join(' | ')}`)

  let closed = false
  const close = async (state: 'finished' | 'failed') => {
    if (closed) return
    closed = true
    const ended = { ...run, state, finishedAt: iso() }
    await writeAtomic(runFile, ended)
    if (!args.has('--no-results')) {
      const { summary } = await writeRunReports(ROOT, ended)
      await track(path.join(ROOT, summary))
      console.log(`  reports    piles/${summary}`)
    }
  }
  const abort = (why: string) => {
    console.log(`✖ ${why}: run marked failed (npm run sim:clean removes it)`)
    void close('failed').finally(() => process.exit(130))
  }
  process.on('SIGINT', () => abort('interrupted'))
  process.on('SIGTERM', () => abort('terminated'))

  try {
    const [m1, m2] = tasks.filter((t) => t.by === 'manager')
    const j = tasks.find((t) => t.by === 'junior')!
    await Promise.all([teamManager(m1), soloManager(m2, stall), juniorTask(j)])
  } catch (e) {
    console.error(e)
    await close('failed')
    process.exit(1)
  }
  if (stall) return console.log('■ left running with a stalled task; npm run sim:clean resets it')
  await close('finished')
  console.log('■ finished')
}

void main()
