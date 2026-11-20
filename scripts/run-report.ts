/**
 * Write the reports for the current/last agent run: `node scripts/run-report.ts`
 *
 *   piles/reports/YYYY-MM-DD/run-HHMM.md          run summary (every task, outcome, time, returned items)
 *   piles/reports/YYYY-MM-DD/<taskId>-<slug>.md   one per task result in the run
 *
 * Reads piles/run.json and the run's results (pending in piles/results/ or already processed).
 * The run-piles skill's orchestrator runs this after closing run.json; it is safe to run again.
 */
import path from 'node:path'
import { readRun, writeRunReports } from '../plugins/reports.ts'

const ROOT = path.resolve(import.meta.dirname, '..', 'piles')

const run = await readRun(ROOT)
if (!run) {
  console.error('No valid piles/run.json: nothing to report.')
  process.exit(1)
}
const { summary, tasks } = await writeRunReports(ROOT, run)
console.log(`Run summary: piles/${summary}`)
for (const t of tasks) console.log(`  piles/${t}`)
if (tasks.length < run.tasks.length) console.log(`  (${run.tasks.length - tasks.length} task(s) without a result yet)`)
