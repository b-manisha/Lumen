/**
 * Lumen ⇄ Claude Code bridge (dev server only).
 *
 * The browser can't write files, so this Vite plugin exposes a tiny local API that mirrors the
 * delegation piles to disk for Claude Code agents, and reads their results back:
 *
 *   GET  /api/piles               health check → { ok, root, pendingResults }
 *   POST /api/piles               { queue, markdown: { human, manager, junior } }
 *                                 → writes piles/queue.json + piles/{human,manager,junior}.md
 *   GET  /api/piles/results       → { results: [...piles/results/*.json], errors }
 *   POST /api/piles/results/ack   { files: ["<taskId>.json", …] } → moves them to piles/results/processed/
 *                                 and removes the matching piles/status/<taskId>.json progress files
 *                                 and writes piles/reports/<day>/<taskId>-<slug>.md for each
 *   GET  /api/piles/status        → { run, statuses, results, timing, now }: live progress of the current
 *                                 agent run (piles/run.json + piles/status/*.json), see piles/README.md.
 *                                 When a run ends, writes its summary to piles/reports/<day>/run-HHMM.md
 *   GET  /api/piles/reports/run?startedAt=<ISO>   → { path, markdown } of that run's summary report
 *   POST /api/piles/run/dismiss   { runId } → marks an abandoned run `failed` (dismissed) in piles/run.json
 *   POST /api/piles/status/clear  { runId, taskId } → removes a stalled task's status files and hides it
 *   GET  /api/piles/run/state, POST /api/piles/run, POST /api/piles/run/stop
 *                                 → the in-app "Run agents" button (see plugins/runner.ts; guarded: localhost,
 *                                   X-Lumen-Run header, not from a ?bridge=read tab)
 *
 * `LUMEN_PILES_DIR` (env) points the bridge at another folder, e.g. a scratch copy for endpoint tests.
 *
 * Only active under `vite` (apply: 'serve'); a production build has no bridge and the app falls back
 * to export buttons.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { runReportPath } from '../src/lib/reportMd.ts'
import { readHires, readRun, readTeamPlan, writeRunReports, writeTaskReport, type TeamPlan } from './reports.ts'
import { createRunner, handleRunRoute } from './runner.ts'

const MAX_BODY = 5 * 1024 * 1024
const PILES = ['human', 'manager', 'junior'] as const
/** A status that hasn't moved for this long while the run is still `running` is reported as stale ("Stalled?"). */
const STALE_MS = 15 * 60 * 1000
/** A `running` run with no status update for this long is reported as abandoned (the orchestrator died). */
const ABANDONED_MS = 30 * 60 * 1000

/** Write via a temp file + rename so readers never see half-written JSON. */
async function writeAtomic(file: string, content: string) {
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
const toTime = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : NaN)

interface RunTask {
  taskId: string
  title: string
  by: 'manager' | 'junior'
}

function parseRun(raw: unknown) {
  if (!isObj(raw) || typeof raw.runId !== 'string' || Number.isNaN(toTime(raw.startedAt))) return null
  const state = raw.state === 'finished' || raw.state === 'failed' ? raw.state : 'running'
  const tasks: RunTask[] = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter(isObj)
    .filter((t) => typeof t.taskId === 'string')
    .map((t) => ({ taskId: String(t.taskId), title: String(t.title ?? 'Task'), by: t.by === 'junior' ? 'junior' : 'manager' }))
  return {
    runId: raw.runId,
    startedAt: String(raw.startedAt),
    finishedAt: typeof raw.finishedAt === 'string' ? raw.finishedAt : undefined,
    state: state as 'running' | 'finished' | 'failed',
    trigger: raw.trigger === 'scheduled' ? ('scheduled' as const) : ('manual' as const),
    /** set when the user dismissed an abandoned run from the app */
    dismissed: raw.dismissed === true,
    /** the user pressed Stop on a run started from Lumen (plugins/runner.ts) */
    stoppedByUser: raw.stoppedByUser === true,
    /** the orchestrator's exit code when the dev server had to close the run */
    exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : undefined,
    /** tasks the user cleared from the run (stalled items) */
    cleared: Array.isArray(raw.cleared) ? raw.cleared.map(String) : [],
    total: typeof raw.total === 'number' ? raw.total : tasks.length,
    tasks,
    abandoned: false,
    /** piles/-relative path of the run summary report, once the run has ended */
    summaryPath: undefined as string | undefined,
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Only plain `<name>.json` files directly inside the results folder. */
function safeResultName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const base = path.basename(name)
  return base === name && /^[\w.-]+\.json$/.test(base) ? base : null
}

async function listResultFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name).sort()
  } catch {
    return []
  }
}

export function pilesBridge(options: { dir?: string } = {}): Plugin {
  let root = ''
  return {
    name: 'lumen-piles-bridge',
    apply: 'serve',
    configResolved(config) {
      root = path.resolve(config.root, process.env.LUMEN_PILES_DIR || options.dir || 'piles')
    },
    configureServer(server) {
      const resultsDir = () => path.join(root, 'results')
      const processedDir = () => path.join(root, 'results', 'processed')
      const statusDir = () => path.join(root, 'status')
      // first/last time we saw each task of a run working, so the UI can show elapsed time even after
      // the status file has been cleaned up. In memory only: { runId, tasks: { taskId: { start, end? } } }
      let timing: { runId: string; tasks: Record<string, { start: number; end?: number }> } = { runId: '', tasks: {} }
      // run summaries written by this server process (runId:state:finishedAt)
      const summarized = new Set<string>()
      const runner = createRunner({ root, projectRoot: server.config.root, logger: server.config.logger })

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/api/piles')) return next()
        try {
          // ── the in-app Run agents button: start / stop / state of a headless orchestrator ──
          if (await handleRunRoute(runner, url, req, res, readBody, send)) return

          // ── health ──
          if (url === '/api/piles' && req.method === 'GET') {
            const pending = await listResultFiles(resultsDir())
            return send(res, 200, { ok: true, root: path.relative(server.config.root, root) || '.', pendingResults: pending.length })
          }

          // ── write the queue + checklists ──
          if (url === '/api/piles' && req.method === 'POST') {
            const body = (await readBody(req)) as { queue?: { tasks?: unknown }; markdown?: Record<string, unknown>; initialized?: boolean }
            if (!body.queue || !Array.isArray(body.queue.tasks)) return send(res, 400, { ok: false, error: 'Missing queue.tasks' })
            // a browser profile that has never stored any Lumen data must not overwrite another profile's queue
            if (body.initialized === false) return send(res, 200, { ok: true, skipped: 'uninitialised store', written: [] })
            await mkdir(resultsDir(), { recursive: true })
            await writeAtomic(path.join(root, 'queue.json'), JSON.stringify(body.queue, null, 2) + '\n')
            for (const pile of PILES) {
              const md = body.markdown?.[pile]
              if (typeof md === 'string') await writeAtomic(path.join(root, `${pile}.md`), md.endsWith('\n') ? md : md + '\n')
            }
            return send(res, 200, { ok: true, written: ['queue.json', ...PILES.map((p) => `${p}.md`)], count: body.queue.tasks.length })
          }

          // ── read agent results ──
          if (url === '/api/piles/results' && req.method === 'GET') {
            const files = await listResultFiles(resultsDir())
            const run = parseRun(await readJson(path.join(root, 'run.json')))
            const results: unknown[] = []
            const errors: { file: string; error: string }[] = []
            for (const file of files) {
              try {
                const data = JSON.parse(await readFile(path.join(resultsDir(), file), 'utf8'))
                if (!data || typeof data.taskId !== 'string' || !['review', 'returned', 'working'].includes(data.status)) {
                  errors.push({ file, error: 'Expected { taskId, status: review|returned|working, by, output }' })
                  continue
                }
                // tie the result to the run that produced it (for report grouping in the app)
                const inRun = run?.tasks.find((t) => t.taskId === data.taskId)
                const since = inRun && run ? toTime(run.startedAt) - 60_000 : 0
                const hires = data.by === 'manager' ? await readHires(root, data.taskId, since) : []
                results.push({
                  ...data,
                  file,
                  ...(inRun && run ? { runId: run.runId, runStartedAt: run.startedAt } : {}),
                  ...(hires.length ? { hires } : {}),
                })
              } catch (e) {
                // probably still being written; picked up on the next poll
                errors.push({ file, error: e instanceof Error ? e.message : 'Unreadable' })
              }
            }
            return send(res, 200, { ok: true, results, errors })
          }

          // ── acknowledge: move processed files aside ──
          if (url === '/api/piles/results/ack' && req.method === 'POST') {
            const body = (await readBody(req)) as { files?: unknown[] }
            const names = (body.files ?? []).map(safeResultName).filter((n): n is string => !!n)
            await mkdir(processedDir(), { recursive: true })
            const moved: string[] = []
            const run = parseRun(await readJson(path.join(root, 'run.json')))
            for (const name of names) {
              // keep a human-readable copy of the report before the result is filed away
              const data = await readJson(path.join(resultsDir(), name))
              if (isObj(data) && typeof data.taskId === 'string') {
                const inRun = run?.tasks.find((t) => t.taskId === data.taskId)
                const since = inRun && run ? toTime(run.startedAt) - 60_000 : 0
                await writeTaskReport(root, data, { title: inRun?.title, runId: inRun ? run?.runId : undefined, since }).catch((e) =>
                  server.config.logger.warn(`[piles] report for ${name} not written: ${e instanceof Error ? e.message : e}`),
                )
              }
              const stamp = new Date().toISOString().replace(/[:.]/g, '-')
              try {
                await rename(path.join(resultsDir(), name), path.join(processedDir(), `${name.replace(/\.json$/, '')}.${stamp}.json`))
                moved.push(name)
              } catch {
                /* already moved */
              }
              // the result is processed: its live progress file has done its job
              await unlink(path.join(statusDir(), name)).catch(() => {})
              const id = name.replace(/\.json$/, '')
              for (const f of await listResultFiles(statusDir())) if (f.startsWith(`${id}.`)) await unlink(path.join(statusDir(), f)).catch(() => {})
            }
            return send(res, 200, { ok: true, moved })
          }

          // ── live progress of the current run ──
          if (url === '/api/piles/status' && req.method === 'GET') {
            const now = Date.now()
            const run = parseRun(await readJson(path.join(root, 'run.json')))
            const runStart = run ? toTime(run.startedAt) : 0
            if (run && timing.runId !== run.runId) timing = { runId: run.runId, tasks: {} }

            // pending (not yet acked) results: lets the UI mark tasks done before the app picks them up
            const results: { taskId: string; status: string; by?: string; at: number }[] = []
            for (const file of await listResultFiles(resultsDir())) {
              const data = await readJson(path.join(resultsDir(), file))
              if (!isObj(data) || typeof data.taskId !== 'string') continue
              const at = (await stat(path.join(resultsDir(), file)).catch(() => null))?.mtimeMs ?? now
              results.push({ taskId: data.taskId, status: String(data.status), by: typeof data.by === 'string' ? data.by : undefined, at })
            }

            interface Status {
              taskId: string
              by: 'manager' | 'junior' | 'senior'
              phase: string
              percent: number
              /** for a manager task with hires: its own percent before the roll-up */
              ownPercent?: number
              message?: string
              updatedAt: string
              stale: boolean
              /** set on a hire's status: piles/status/<parentTaskId>.<hireId>.json */
              parentTaskId?: string
              hireId?: string
            }
            const statuses: Status[] = []
            for (const file of await listResultFiles(statusDir())) {
              const data = await readJson(path.join(statusDir(), file))
              if (!isObj(data) || typeof data.taskId !== 'string') continue
              const updated = toTime(data.updatedAt)
              if (Number.isNaN(updated)) continue
              // leftovers from an earlier run are ignored
              if (run && updated < runStart - 60_000) continue
              const percent = Math.max(0, Math.min(100, Math.round(Number(data.percent) || 0)))
              const hireId = typeof data.hireId === 'string' ? data.hireId : undefined
              statuses.push({
                taskId: hireId ? String(data.parentTaskId ?? data.taskId) : data.taskId,
                by: data.by === 'junior' ? 'junior' : data.by === 'senior' ? 'senior' : 'manager',
                phase: String(data.phase ?? 'Working').slice(0, 40),
                percent,
                message: typeof data.message === 'string' ? data.message.slice(0, 140) : undefined,
                updatedAt: new Date(updated).toISOString(),
                stale: run?.state === 'running' && percent < 100 && now - updated > STALE_MS,
                ...(hireId ? { parentTaskId: String(data.parentTaskId ?? data.taskId), hireId } : {}),
              })
            }

            // Manager teams: staffing plans written in this run, with which hires have delivered
            const teams: Record<string, { rationale: string; hires: (TeamPlan['hires'][number] & { done: boolean; revised: boolean })[] }> = {}
            if (run) {
              for (const t of run.tasks.filter((x) => x.by === 'manager')) {
                const plan = await readTeamPlan(root, t.taskId)
                if (!plan || plan.at < runStart - 60_000) continue
                const outputs = new Map((await readHires(root, t.taskId, runStart - 60_000)).map((h) => [h.hireId, h]))
                teams[t.taskId] = {
                  rationale: plan.rationale,
                  hires: plan.hires.map((h) => ({ ...h, done: outputs.has(h.hireId), revised: !!outputs.get(h.hireId)?.revision })),
                }
              }
            }
            // roll a manager's percent up from its phases and its hires:
            //   planning 0-15 (manager), team at work 15-85 (average of hires), review & assemble 85-100 (manager)
            for (const st of statuses) {
              if (st.hireId) continue
              const team = teams[st.taskId]
              if (!team?.hires.length) continue
              const hireStatus = (id: string) => statuses.find((x) => x.hireId === id && x.taskId === st.taskId)
              const pct = team.hires.map((h) => {
                const hs = hireStatus(h.hireId)
                // a delivered hire counts 100 unless it is back at work on a revision
                return h.done && (!hs || hs.percent >= 100) ? 100 : (hs?.percent ?? 0)
              })
              const avg = pct.reduce((a, b) => a + b, 0) / pct.length
              st.ownPercent = st.percent
              if (st.percent < 85) st.percent = Math.round(Math.max(st.percent, 15 + 0.7 * avg))
              // the manager is idle while its team works: only stale if the whole team is quiet
              const last = Math.max(toTime(st.updatedAt), ...statuses.filter((x) => x.taskId === st.taskId && x.hireId).map((x) => toTime(x.updatedAt)))
              st.stale = run?.state === 'running' && st.percent < 100 && now - last > STALE_MS
            }

            if (run) {
              for (const st of statuses) {
                const t = (timing.tasks[st.hireId ? `${st.taskId}.${st.hireId}` : st.taskId] ??= { start: toTime(st.updatedAt) })
                t.start = Math.min(t.start, toTime(st.updatedAt))
                if ((st.ownPercent ?? st.percent) >= 100) t.end ??= toTime(st.updatedAt)
                // a hire that went back to work (revision round) is running again
                else if (st.hireId) t.end = undefined
              }
              for (const r of results) {
                const t = timing.tasks[r.taskId]
                if (t) t.end ??= r.at
              }
              if (run.state === 'running') {
                // abandoned = no status update (or result) for ABANDONED_MS
                const last = Math.max(runStart, ...statuses.map((x) => toTime(x.updatedAt)), ...results.map((r) => r.at))
                run.abandoned = now - last > ABANDONED_MS
              } else {
                // the run ended: write its summary report once (the orchestrator may also have written it)
                const key = `${run.runId}:${run.state}:${run.finishedAt ?? ''}`
                if (!summarized.has(key)) {
                  summarized.add(key)
                  const base = await readRun(root)
                  if (base) await writeRunReports(root, base).catch(() => summarized.delete(key))
                }
                run.summaryPath = runReportPath(run)
              }
            }
            return send(res, 200, { ok: true, now, run, statuses, teams, results, timing: run ? timing.tasks : {} })
          }

          // ── dismiss an abandoned run / clear a stalled task ──
          if ((url === '/api/piles/run/dismiss' || url === '/api/piles/status/clear') && req.method === 'POST') {
            const body = (await readBody(req)) as { runId?: unknown; taskId?: unknown }
            const file = path.join(root, 'run.json')
            const raw = await readJson(file)
            if (!isObj(raw) || raw.runId !== body.runId) return send(res, 409, { ok: false, error: 'That run is no longer current' })
            if (url === '/api/piles/run/dismiss') {
              if (raw.state === 'running') Object.assign(raw, { state: 'failed', finishedAt: new Date().toISOString(), dismissed: true })
            } else {
              const id = typeof body.taskId === 'string' && /^[\w-]+$/.test(body.taskId) ? body.taskId : null
              if (!id) return send(res, 400, { ok: false, error: 'Bad taskId' })
              raw.cleared = [...new Set([...(Array.isArray(raw.cleared) ? raw.cleared.map(String) : []), id])]
              for (const f of await listResultFiles(statusDir())) if (f === `${id}.json` || f.startsWith(`${id}.`)) await unlink(path.join(statusDir(), f)).catch(() => {})
            }
            await writeAtomic(file, JSON.stringify(raw, null, 2) + '\n')
            return send(res, 200, { ok: true })
          }

          // ── a run's summary report (markdown) ──
          if (url === '/api/piles/reports/run' && req.method === 'GET') {
            const q = new URL(req.url ?? '', 'http://x').searchParams
            let startedAt = q.get('startedAt') ?? ''
            const latest = await readRun(root)
            if (!startedAt && latest) startedAt = latest.startedAt
            if (Number.isNaN(Date.parse(startedAt))) return send(res, 404, { ok: false, error: 'No run' })
            const rel = runReportPath({ startedAt })
            let markdown = await readFile(path.join(root, rel), 'utf8').catch(() => '')
            // the latest run may not have a file yet (still running, or written by an older bridge)
            if (!markdown && latest && Date.parse(latest.startedAt) === Date.parse(startedAt)) {
              await writeRunReports(root, latest)
              markdown = await readFile(path.join(root, rel), 'utf8').catch(() => '')
            }
            if (!markdown) return send(res, 404, { ok: false, error: 'No summary for that run' })
            return send(res, 200, { ok: true, path: `piles/${rel}`, markdown })
          }

          return send(res, 404, { ok: false, error: 'Unknown piles endpoint' })
        } catch (e) {
          return send(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Bridge error' })
        }
      })
    },
  }
}
