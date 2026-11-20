/**
 * Harmless stand-in for the orchestrator, for testing the in-app Run button without spending Claude usage.
 *
 *   LUMEN_RUN_CMD="node scripts/fake-run.ts --secs=20" npm run dev
 *
 * The dev server then runs this instead of `claude -p …` (see plugins/runner.ts). It writes what a real run
 * writes for the live status bar (piles/run.json + piles/status/*.json), prints log lines, sleeps, and closes
 * run.json. It never writes results, so no task is changed.
 *
 * Options (also read from <piles>/fake-run.args, one line, so a test can vary them without a server restart):
 *           --secs=N          how long the run takes (default 20)
 *           --exit=N          exit with this code at the end (default 0; non-zero = a failed run)
 *           --no-finish       exit without closing run.json (the server must mark it failed)
 *           --crash           exit 3 at once, before writing anything (the server records a failed run)
 *           --use-selection   use the selected tasks (LUMEN_RUN_TASKS) instead of two synthetic stand-in tasks.
 *                             Only use this with a scratch LUMEN_PILES_DIR: status files show on real cards.
 *
 * Env (set by the server): LUMEN_PILES_DIR, LUMEN_RUN_TASKS (JSON [{ id, title, by }]), LUMEN_RUN_PROMPT.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.env.LUMEN_PILES_DIR || path.resolve(import.meta.dirname, '..', 'piles')
// extra options from <piles>/fake-run.args (one line), so tests can vary a run without restarting the server
const extra = (await readFile(path.join(ROOT, 'fake-run.args'), 'utf8').catch(() => '')).split(/\s+/).filter(Boolean)
const argv = [...extra, ...process.argv.slice(2)] // the file wins
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const flag = (name: string) => argv.includes(`--${name}`)
const SECS = Number(arg('secs') ?? 20)
const EXIT = Number(arg('exit') ?? 0)

type T = { taskId: string; title: string; by: 'manager' | 'junior' }
const selected = (JSON.parse(process.env.LUMEN_RUN_TASKS || '[]') as { id: string; title: string; by: 'manager' | 'junior' }[]).map((t) => ({
  taskId: t.id,
  title: t.title,
  by: t.by,
}))
const tasks: T[] = flag('use-selection')
  ? selected
  : [
      { taskId: 'standin-mgr', title: 'Stand-in Manager task', by: 'manager' },
      { taskId: 'standin-jr', title: 'Stand-in Junior task', by: 'junior' },
    ]

async function writeAtomic(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2) + '\n')
  await rename(`${file}.tmp`, file)
}
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000))
const log = (m: string) => console.log(`stand-in: ${m}`)

process.on('SIGTERM', () => {
  log('received SIGTERM, exiting')
  process.exit(143)
})

if (flag('crash')) {
  console.error('stand-in: crashing on purpose (--crash)')
  process.exit(3)
}

const now = new Date()
const run = {
  runId: now.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-'),
  startedAt: now.toISOString(),
  state: 'running',
  trigger: 'manual',
  total: tasks.length,
  tasks,
  standIn: true,
}
log(`prompt: ${process.env.LUMEN_RUN_PROMPT ?? '(none)'}`)
await writeAtomic(path.join(ROOT, 'run.json'), run)
log(`wrote run.json with ${tasks.length} task(s)`)

const steps: [string, number, string][] = [
  ['Starting', 5, 'Reading the brief'],
  ['Researching', 25, 'Looking things up'],
  ['Drafting', 50, 'Writing the first pass'],
  ['Reviewing', 75, 'Tightening it up'],
  ['Finishing', 100, 'Wrapping up'],
]
for (const [phase, percent, message] of steps) {
  for (const t of tasks) {
    await writeAtomic(path.join(ROOT, 'status', `${t.taskId}.json`), {
      taskId: t.taskId,
      by: t.by,
      phase,
      percent,
      message,
      updatedAt: new Date().toISOString(),
    })
  }
  log(`${phase} ${percent}%`)
  await sleep(SECS / steps.length)
}

if (!flag('no-finish')) {
  await writeAtomic(path.join(ROOT, 'run.json'), { ...run, state: EXIT ? 'failed' : 'finished', finishedAt: new Date().toISOString() })
  log(`closed run.json (${EXIT ? 'failed' : 'finished'})`)
} else log('exiting without closing run.json')
process.exit(EXIT)
