/**
 * "Run agents" from inside Lumen (dev server only): starts the run-piles orchestrator as a headless
 * Claude Code process and lets the app watch and stop it. Mounted by plugins/piles.ts.
 *
 *   GET  /api/piles/run/state?lines=N  → { canRun, reason?, message?, selectable, active, pid?, startedAt?,
 *                                         log?, logTail?, lastExit?, cli }
 *   POST /api/piles/run                { taskIds?: string[] } → spawns the orchestrator (409 if a run is active,
 *                                         409 if nothing is selectable, 500 if the CLI isn't found)
 *   POST /api/piles/run/stop           → kills the spawned process tree, marks run.json failed + stoppedByUser
 *
 * Security: these endpoints start a local agent, so every request must carry `X-Lumen-Run: 1`, come from
 * localhost/127.0.0.1/[::1] on the dev port (Host and, when present, Origin), and not be a cross-site
 * fetch. A tab in `?bridge=read` mode sends `X-Lumen-Mode: read` and can't start or stop runs.
 *
 * Permissions: headless mode can't answer prompts, so the CLI runs with `--permission-mode dontAsk` and a
 * scoped allow-list (see ALLOWED_TOOLS). Anything not on the list is denied, never prompted, never bypassed.
 *
 * Stand-in for tests: set `LUMEN_RUN_CMD` (e.g. `node scripts/fake-run.ts --secs=20`) and the server runs
 * that shell command instead of the CLI, with LUMEN_RUN_PROMPT / LUMEN_RUN_TASKS / LUMEN_PILES_DIR in its env.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, constants as FS, openSync, writeSync } from 'node:fs'
import { access, mkdir, open as openFile, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Orchestrator model. It spawns Opus Managers and Sonnet/Haiku Juniors itself, per the runbook. */
export const ORCHESTRATOR_MODEL = 'sonnet'

/**
 * The scoped allow-list. With `--permission-mode dontAsk`, every other tool call is denied.
 * - Edit/Write rules are path-scoped to piles/. Claude Code also checks `mkdir`/`mv` targets against the
 *   Edit rules, so `Bash(mkdir:*)` / `Bash(mv:*)` can only touch piles/ (verified against CLI 2.1.74).
 * - Read is limited to the project; Glob/Grep are read-only.
 * - `Task` is the subagent tool (`Agent` is its newer name; both are listed so either CLI version works).
 */
export const ALLOWED_TOOLS = [
  'Task',
  'Agent',
  'Read(./**)',
  'Glob',
  'Grep',
  'Edit(./piles/**)',
  'Write(./piles/**)',
  'WebSearch',
  'WebFetch',
  'Bash(python3 -c:*)',
  'Bash(node scripts/run-report.ts)',
  'Bash(mkdir:*)',
  'Bash(mv:*)',
  'Bash(ls:*)',
]

const PROMPT_BASE =
  'Run the Lumen delegation piles. Follow .claude/skills/run-piles/SKILL.md exactly. Trigger: manual (started from the Lumen Run button).' +
  ' This is a headless run from the project root: run the runbook commands exactly as written, one per Bash call, with no cd or && chaining (tell your subagents the same).'

const MAX_LOGS = 20
const ABANDONED_MS = 30 * 60 * 1000
const SAFE_ID = /^[\w-]+$/

type By = 'manager' | 'junior'
export interface Selectable {
  id: string
  title: string
  by: By
}

interface Active {
  pid: number
  startedAt: string
  log: string
  /** run.json runId before we spawned: a different id afterwards means the orchestrator wrote its own */
  prevRunId: string | null
  stopRequested?: boolean
}

interface LastExit {
  code: number | null
  signal: string | null
  at: string
  stoppedByUser: boolean
  log: string
  ok: boolean
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeAtomic(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, content)
  await rename(tmp, file)
}

function alive(pid: number | undefined): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * The runbook's selection rules (SKILL.md §1): owner manager|junior, not humanOnly, agent null/queued/working,
 * and no pending piles/results/<id>.json.
 */
export function selectTasks(queue: unknown, pendingIds: Set<string>): Selectable[] {
  if (!isObj(queue) || !Array.isArray(queue.tasks)) return []
  const out: Selectable[] = []
  for (const t of queue.tasks) {
    if (!isObj(t) || typeof t.id !== 'string') continue
    if (t.owner !== 'manager' && t.owner !== 'junior') continue
    if (t.humanOnly !== false) continue
    const agent = t.agent
    if (agent != null && !(isObj(agent) && (agent.status === 'queued' || agent.status === 'working'))) continue
    if (pendingIds.has(t.id)) continue
    out.push({ id: t.id, title: String(t.title ?? 'Untitled task'), by: t.owner })
  }
  return out
}

/** Find the Claude Code CLI: $LUMEN_CLAUDE_BIN, then $PATH, then ~/.local/bin/claude. */
export async function findClaude(): Promise<string | null> {
  const candidates: string[] = []
  if (process.env.LUMEN_CLAUDE_BIN) candidates.push(process.env.LUMEN_CLAUDE_BIN)
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, 'claude'))
  candidates.push(path.join(os.homedir(), '.local', 'bin', 'claude'))
  for (const c of candidates) {
    try {
      await access(c, FS.X_OK)
      if ((await stat(c)).isFile()) return c
    } catch {
      /* next */
    }
  }
  return null
}

/** argv for the orchestrator (exported for docs/tests). */
export function claudeArgs(prompt: string): string[] {
  return [
    '-p',
    '--model',
    ORCHESTRATOR_MODEL,
    '--permission-mode',
    'dontAsk',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    // only project settings: a user-level allow rule can't widen the list above
    '--setting-sources',
    'project,local',
    // no MCP servers (mail, calendar, …): agents never act as the user
    '--strict-mcp-config',
    '--output-format',
    'stream-json',
    '--verbose',
    '--',
    prompt,
  ]
}

// ── log formatting: stream-json → readable lines ──

function short(s: unknown, n = 220): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

function toolLine(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Task':
    case 'Agent':
      return `→ Subagent${input.model ? ` (${input.model})` : ''}: ${short(input.description ?? input.prompt, 140)}`
    case 'Bash':
      return `→ Bash: ${short(input.command, 160)}`
    case 'Read':
    case 'Write':
    case 'Edit':
      return `→ ${name}: ${short(input.file_path, 160)}`
    case 'WebSearch':
      return `→ WebSearch: ${short(input.query, 160)}`
    case 'WebFetch':
      return `→ WebFetch: ${short(input.url, 160)}`
    case 'Glob':
    case 'Grep':
      return `→ ${name}: ${short(input.pattern, 160)}`
    default:
      return `→ ${name}`
  }
}

export function formatLogLine(line: string): string[] {
  const raw = line.trimEnd()
  if (!raw) return []
  if (raw[0] !== '{') return [raw]
  let e: Record<string, unknown>
  try {
    e = JSON.parse(raw)
  } catch {
    return [raw]
  }
  const nest = e.parent_tool_use_id ? '  ↳ ' : ''
  const msg = isObj(e.message) ? e.message : null
  const content = msg && Array.isArray(msg.content) ? msg.content.filter(isObj) : []
  if (e.type === 'system' && e.subtype === 'init')
    return [`Session started · model ${e.model ?? '?'} · permission mode ${e.permissionMode ?? '?'}`]
  if (e.type === 'assistant') {
    const out: string[] = []
    for (const c of content) {
      if (c.type === 'text' && String(c.text ?? '').trim()) out.push(`${nest}Claude: ${short(c.text, 400)}`)
      if (c.type === 'tool_use') out.push(nest + toolLine(String(c.name), isObj(c.input) ? c.input : {}))
    }
    return out
  }
  if (e.type === 'user') {
    const out: string[] = []
    for (const c of content) {
      if (c.type !== 'tool_result') continue
      const text = Array.isArray(c.content) ? c.content.map((x) => (isObj(x) ? x.text : x)).join(' ') : c.content
      if (c.is_error) out.push(`${nest}✕ ${short(text, 240)}`)
    }
    return out
  }
  if (e.type === 'result') {
    const secs = typeof e.duration_ms === 'number' ? ` · ${Math.round(e.duration_ms / 1000)}s` : ''
    const cost = typeof e.total_cost_usd === 'number' ? ` · $${e.total_cost_usd.toFixed(2)}` : ''
    return [`Finished: ${e.subtype ?? 'done'}${e.is_error ? ' (error)' : ''} · ${e.num_turns ?? '?'} turns${secs}${cost}`, ...(e.result ? [short(e.result, 600)] : [])]
  }
  return []
}

async function tailFile(file: string, lines: number): Promise<string[]> {
  try {
    const fh = await openFile(file, 'r')
    try {
      const { size } = await fh.stat()
      // stream-json lines can be long: read enough bytes to cover the wanted lines
      const want = Math.min(size, Math.max(64 * 1024, lines * 8 * 1024))
      const buf = Buffer.alloc(want)
      await fh.read(buf, 0, want, size - want)
      let parts = buf.toString('utf8').split('\n')
      if (want < size) parts = parts.slice(1)
      return parts.flatMap(formatLogLine).slice(-lines)
    } finally {
      await fh.close()
    }
  } catch {
    return []
  }
}

// ── security ──

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Returns an error message when the request must be rejected (403), else null. */
export function guard(req: IncomingMessage, write: boolean): string | null {
  if (req.headers['x-lumen-run'] !== '1') return 'Missing X-Lumen-Run header'
  const port = req.socket.localPort
  const okHost = (h: string | undefined) => {
    if (!h) return false
    const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(h)
    return !!m && LOCAL_HOSTS.has(m[1].toLowerCase()) && Number(m[2] ?? 80) === port
  }
  if (!okHost(req.headers.host)) return 'Host must be localhost on the dev port'
  const origin = req.headers.origin
  if (origin !== undefined || write) {
    let host: string | undefined
    try {
      const u = new URL(String(origin))
      host = u.protocol === 'http:' || u.protocol === 'https:' ? u.host : undefined
    } catch {
      host = undefined
    }
    if (!okHost(host)) return 'Cross-site request blocked'
  }
  const site = req.headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return 'Cross-site request blocked'
  if (write && req.headers['x-lumen-mode'] === 'read') return 'This tab is in read-only mode (?bridge=read)'
  return null
}

// ── the runner ──

export function createRunner(opts: { root: string; projectRoot: string; logger: { info: (m: string) => void; warn: (m: string) => void } }) {
  const { root, projectRoot, logger } = opts
  const logsDir = path.join(root, 'logs')
  const activeFile = path.join(logsDir, 'active.json')
  const lastExitFile = path.join(logsDir, 'last-exit.json')
  const runFile = path.join(root, 'run.json')
  let child: ChildProcess | null = null
  let active: Active | null = null
  let loaded = false

  /** Survive dev-server restarts: the spawned process is detached, so remember it on disk. */
  async function load() {
    if (loaded) return
    loaded = true
    const a = await readJson(activeFile)
    if (isObj(a) && typeof a.pid === 'number' && alive(a.pid)) active = a as unknown as Active
    else if (isObj(a)) await finish(a as unknown as Active, null, null)
  }

  async function pendingIds(): Promise<Set<string>> {
    try {
      return new Set((await readdir(path.join(root, 'results'))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
    } catch {
      return new Set()
    }
  }

  /** run.json says running and the run isn't abandoned (no status/result update for 30 min). */
  async function runJsonActive(): Promise<{ active: boolean; run: Record<string, unknown> | null }> {
    const run = await readJson(runFile)
    if (!isObj(run) || run.state !== 'running') return { active: false, run: isObj(run) ? run : null }
    const start = Date.parse(String(run.startedAt))
    let last = Number.isNaN(start) ? 0 : start
    for (const dir of ['status', 'results']) {
      try {
        for (const f of await readdir(path.join(root, dir))) {
          if (!f.endsWith('.json')) continue
          const m = (await stat(path.join(root, dir, f)).catch(() => null))?.mtimeMs ?? 0
          if (m > last) last = m
        }
      } catch {
        /* none */
      }
    }
    return { active: Date.now() - last <= ABANDONED_MS, run }
  }

  async function pruneLogs() {
    try {
      const logs = (await readdir(logsDir)).filter((f) => /^run-.*\.log$/.test(f)).sort()
      for (const f of logs.slice(0, Math.max(0, logs.length - MAX_LOGS))) await unlink(path.join(logsDir, f)).catch(() => {})
    } catch {
      /* no logs yet */
    }
  }

  function appendLog(file: string, line: string) {
    try {
      const fd = openSync(file, 'a')
      writeSync(fd, `[lumen ${new Date().toISOString()}] ${line}\n`)
      closeSync(fd)
    } catch {
      /* ignore */
    }
  }

  /**
   * The process is gone: make sure run.json never sticks on "running". If the orchestrator wrote a run and
   * didn't close it (or exited non-zero), mark it failed with the exit code; if it never wrote one but failed,
   * record a failed run so the status bar shows it.
   */
  async function finish(a: Active, code: number | null, signal: NodeJS.Signals | null) {
    const stopped = !!a.stopRequested
    let ok = code === 0 && !stopped
    const run = await readJson(runFile)
    const ours = isObj(run) && run.runId !== a.prevRunId && Date.parse(String(run.startedAt)) >= Date.parse(a.startedAt) - 5000
    const now = new Date().toISOString()
    if (ours && isObj(run)) {
      // exited without closing its run record: that's a failure even with exit code 0
      if (run.state === 'running') ok = false
      if (!ok && (run.state !== 'failed' || run.exitCode === undefined || (stopped && !run.stoppedByUser))) {
        Object.assign(run, { state: 'failed', finishedAt: run.state === 'failed' && run.finishedAt ? run.finishedAt : now, exitCode: code, ...(stopped ? { stoppedByUser: true } : {}) })
        await writeAtomic(runFile, JSON.stringify(run, null, 2) + '\n')
      }
    } else if (!ok) {
      const ts = a.startedAt.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
      await writeAtomic(
        runFile,
        JSON.stringify(
          { runId: ts, startedAt: a.startedAt, finishedAt: now, state: 'failed', trigger: 'manual', total: 0, tasks: [], exitCode: code, ...(stopped ? { stoppedByUser: true } : {}) },
          null,
          2,
        ) + '\n',
      )
    }
    const exit: LastExit = { code, signal, at: now, stoppedByUser: stopped, log: path.basename(a.log), ok }
    await writeAtomic(lastExitFile, JSON.stringify(exit, null, 2) + '\n').catch(() => {})
    await unlink(activeFile).catch(() => {})
    appendLog(a.log, stopped ? 'stopped by the user' : `orchestrator exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`)
  }

  /** Detect a process that died while no `exit` listener was attached (e.g. after a dev-server restart). */
  async function reap() {
    await load()
    if (active && !child && !alive(active.pid)) {
      const a = active
      active = null
      await finish(a, null, null)
    }
  }

  async function state(lines: number) {
    await reap()
    const queue = await readJson(path.join(root, 'queue.json'))
    const selectable = selectTasks(queue, await pendingIds())
    const rj = await runJsonActive()
    const procActive = !!active && alive(active.pid)
    const cli = process.env.LUMEN_RUN_CMD ? 'stand-in' : (await findClaude()) ? 'found' : 'missing'
    let reason: string | undefined
    let message: string | undefined
    if (procActive || rj.active) {
      reason = 'running'
      message = procActive ? 'Agents are already running' : 'A run started elsewhere (Claude Code or the schedule) is still going'
    } else if (!queue) {
      reason = 'no-queue'
      message = 'No piles/queue.json yet. Open Lumen in normal mode so the bridge writes it.'
    } else if (!selectable.length) {
      reason = 'nothing'
      message = 'Nothing queued for agents'
    } else if (cli === 'missing') {
      reason = 'cli-missing'
      message = 'Claude Code CLI not found (looked in PATH and ~/.local/bin/claude)'
    }
    const lastExit = (await readJson(lastExitFile)) as LastExit | null
    const logName = active?.log ? path.basename(active.log) : (lastExit?.log ?? null)
    const logTail = logName ? await tailFile(path.join(logsDir, logName), lines) : []
    return {
      ok: true,
      canRun: !reason,
      reason,
      message,
      selectable,
      active: procActive,
      /** run.json is running (any source) */
      runActive: rj.active,
      pid: procActive ? active?.pid : undefined,
      startedAt: procActive ? active?.startedAt : undefined,
      log: logName ? `piles/logs/${logName}` : undefined,
      logTail,
      lastExit: lastExit ?? undefined,
      cli,
      model: ORCHESTRATOR_MODEL,
    }
  }

  async function start(body: { taskIds?: unknown }) {
    await reap()
    const s = await state(0)
    if (s.reason === 'running') return { status: 409, body: { ok: false, reason: 'running', error: s.message } }
    if (s.reason === 'no-queue') return { status: 409, body: { ok: false, reason: 'no-queue', error: s.message } }
    let tasks = s.selectable
    if (Array.isArray(body.taskIds)) {
      const want = new Set(body.taskIds.filter((x): x is string => typeof x === 'string' && SAFE_ID.test(x)))
      tasks = tasks.filter((t) => want.has(t.id))
    }
    if (!tasks.length) return { status: 409, body: { ok: false, reason: 'nothing', error: 'Nothing queued for agents', selectable: s.selectable } }

    const standIn = process.env.LUMEN_RUN_CMD
    const bin = standIn ? null : await findClaude()
    if (!standIn && !bin)
      return { status: 500, body: { ok: false, reason: 'cli-missing', error: 'Claude Code CLI not found. Install it, or put `claude` on PATH or at ~/.local/bin/claude.' } }

    const subset = tasks.length < s.selectable.length
    const prompt = subset
      ? `${PROMPT_BASE} Only run these task ids: ${tasks.map((t) => t.id).join(', ')}. Skip every other task, even if selectable.`
      : PROMPT_BASE

    await mkdir(logsDir, { recursive: true })
    const startedAt = new Date().toISOString()
    const logPath = path.join(logsDir, `run-${startedAt.replace(/[:.]/g, '-')}.log`)
    const command = standIn ? ['sh', '-c', standIn] : [bin as string, ...claudeArgs(prompt)]
    appendLog(logPath, `starting ${standIn ? `stand-in: ${standIn}` : `${bin} (model ${ORCHESTRATOR_MODEL})`}`)
    appendLog(logPath, `tasks (${tasks.length}): ${tasks.map((t) => `${t.by}: ${t.title}`).join(' | ')}`)
    if (!standIn) appendLog(logPath, `allowed tools: ${ALLOWED_TOOLS.join(' ')}`)

    const env: NodeJS.ProcessEnv = { ...process.env, LUMEN_RUN_PROMPT: prompt, LUMEN_RUN_TASKS: JSON.stringify(tasks), LUMEN_PILES_DIR: root }
    // a nested-session marker from the app that started `npm run dev` would make the CLI refuse to start
    for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_AGENT_SDK_VERSION']) delete env[k]

    const run = await readJson(runFile)
    const fd = openSync(logPath, 'a')
    let proc: ChildProcess
    let spawned: Promise<Error | null>
    try {
      // detached: its own process group (Stop kills the whole tree) and it outlives this request
      proc = spawn(command[0], command.slice(1), { cwd: projectRoot, env, detached: true, stdio: ['ignore', fd, fd] })
      // listen right away: 'spawn' fires on the next tick
      spawned = new Promise<Error | null>((resolve) => {
        proc.once('error', resolve)
        proc.once('spawn', () => resolve(null))
      })
    } finally {
      closeSync(fd)
    }
    const a: Active = { pid: proc.pid ?? 0, startedAt, log: logPath, prevRunId: isObj(run) && typeof run.runId === 'string' ? run.runId : null }
    const spawnError = await spawned
    if (spawnError || !proc.pid) {
      appendLog(logPath, `failed to start: ${spawnError?.message ?? 'no pid'}`)
      return { status: 500, body: { ok: false, reason: 'spawn-failed', error: `Couldn’t start the orchestrator: ${spawnError?.message ?? 'no pid'}` } }
    }
    child = proc
    active = a
    proc.once('exit', (code, signal) => {
      if (child === proc) child = null
      if (active?.pid === a.pid) active = null
      void finish(a, code, signal).catch((e) => logger.warn(`[piles] run exit bookkeeping failed: ${e instanceof Error ? e.message : e}`))
    })
    proc.unref()
    if (active === a) await writeAtomic(activeFile, JSON.stringify(a, null, 2) + '\n')
    await pruneLogs()
    logger.info(`[piles] agent run started (pid ${a.pid}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}), log: piles/logs/${path.basename(logPath)}`)
    return { status: 202, body: { ok: true, pid: a.pid, startedAt, log: `piles/logs/${path.basename(logPath)}`, tasks } }
  }

  async function stop() {
    await reap()
    const a = active
    if (!a || !alive(a.pid)) return { status: 409, body: { ok: false, reason: 'not-running', error: 'No run started from Lumen is active' } }
    a.stopRequested = true
    // our own ChildProcess reports the exit (and does the bookkeeping); after a dev-server restart we must
    const owned = !!child && child.pid === a.pid
    await writeAtomic(activeFile, JSON.stringify(a, null, 2) + '\n')
    const killGroup = (sig: NodeJS.Signals) => {
      try {
        process.kill(-a.pid, sig)
      } catch {
        try {
          process.kill(a.pid, sig)
        } catch {
          /* gone */
        }
      }
    }
    killGroup('SIGTERM')
    // give it a moment, then make sure the whole tree is gone
    for (let i = 0; i < 25 && alive(a.pid); i++) await new Promise((r) => setTimeout(r, 200))
    if (alive(a.pid)) killGroup('SIGKILL')
    // subagent shells may linger in the group after the leader exits
    setTimeout(() => killGroup('SIGKILL'), 1500)
    if (!owned) {
      // not our ChildProcess object (the dev server restarted since): do the exit bookkeeping here
      active = null
      await finish(a, null, 'SIGTERM')
    } else {
      // let the exit listener finish its bookkeeping before we answer
      for (let i = 0; i < 20 && active?.pid === a.pid; i++) await new Promise((r) => setTimeout(r, 100))
      await new Promise((r) => setTimeout(r, 200))
    }
    return { status: 200, body: { ok: true, stopped: a.pid } }
  }

  return { state, start, stop }
}

export type Runner = ReturnType<typeof createRunner>

/** Route /api/piles/run{,/stop,/state}. Returns false when the URL isn't one of ours. */
export async function handleRunRoute(
  runner: Runner,
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
  readBody: (req: IncomingMessage) => Promise<unknown>,
  send: (res: ServerResponse, status: number, body: unknown) => void,
): Promise<boolean> {
  const routes: Record<string, string> = { '/api/piles/run': 'POST', '/api/piles/run/stop': 'POST', '/api/piles/run/state': 'GET' }
  if (!(url in routes)) return false
  if (req.method !== routes[url]) {
    send(res, 405, { ok: false, error: `Use ${routes[url]}` })
    return true
  }
  const blocked = guard(req, req.method === 'POST')
  if (blocked) {
    send(res, 403, { ok: false, reason: 'forbidden', error: blocked })
    return true
  }
  if (url === '/api/piles/run/state') {
    const n = Number(new URL(req.url ?? '', 'http://x').searchParams.get('lines') ?? 30)
    send(res, 200, await runner.state(Math.max(0, Math.min(500, Number.isFinite(n) ? n : 30))))
    return true
  }
  if (url === '/api/piles/run') {
    const r = await runner.start(((await readBody(req)) ?? {}) as { taskIds?: unknown })
    send(res, r.status, r.body)
    return true
  }
  const r = await runner.stop()
  send(res, r.status, r.body)
  return true
}
