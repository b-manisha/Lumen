/**
 * Sanity checks for the delegation auto-sort (src/lib/delegate.ts).
 * Run: npm run test:sort   (plain Node, which strips the TypeScript types natively)
 */
import { classify, type SortInput } from '../src/lib/delegate.ts'

type Expect = [input: string | SortInput, owner: 'human' | 'manager' | 'junior', locked?: boolean]

const CASES: Expect[] = [
  // Hard human rules: agents may never take these
  ['Call mom', 'human', true],
  ['Phone the plumber about the leak', 'human', true],
  ['Sync with support on FAQ', 'human', true],
  [{ title: 'Review onboarding flow with design', tags: ['meeting'] }, 'human', true],
  ['Pay electricity bill', 'human', true],
  ['Buy a new desk lamp', 'human', true],
  ['Book flights for December trip', 'human', true],
  ['Schedule dentist appointment', 'human', true],
  ['Sign the lease renewal', 'human', true],
  ['Renew passport', 'human', true],
  ['Reply to Alex about the conference talk', 'human', true],
  ['Send the invoice to Acme', 'human', true],
  ['Pick up dry cleaning', 'human', true],
  [{ title: 'Plan Sam’s birthday dinner', tags: ['family'] }, 'human', true],
  ['Decide on the pricing tiers', 'human', true],
  ['Log in to the bank portal and download statements', 'human', true],
  [{ title: 'Morning run, 5k', tags: ['fitness'] }, 'human', true],

  // Manager pile
  ['Research standing desk options', 'manager'],
  ['Compare CRM tools for the sales team', 'manager'],
  ['Plan the Q1 product roadmap', 'manager'],
  ['Analyse churn in last month’s cohort', 'manager'],
  ['Weekly metrics review', 'manager'],
  ['Break down the onboarding epic into tickets', 'manager'],
  ['Prepare a proposal for the new pricing model', 'manager'],
  ['Prioritise the bug backlog', 'manager'],
  ['Research which standing desk to buy', 'manager'],

  // Junior pile
  ['Write launch announcement draft', 'junior'],
  ['Draft press kit', 'junior'],
  ['Summarise the customer interview notes', 'junior'],
  ['Outline the blog post on focus', 'junior'],
  ['Proofread the README', 'junior'],
  ['Create a packing checklist for the trip', 'junior'],
  ['Look up the opening hours of the passport office', 'human', true], // passport → ID rule wins (safe default)
  ['Find three coworking spaces near the office', 'junior'],
  ['Draft a reply to Alex about the conference talk', 'junior'],
  [{ title: 'Finalize pricing page copy', tags: ['writing', 'web'] }, 'junior'],

  // Default: nothing matched → you, low confidence
  ['Fix flaky e2e auth test', 'human', false],
  ['Set up status page', 'human', false],
  [{ title: 'QA checkout on Safari + iOS', tags: ['qa'] }, 'human', false],
  ['Yoga class', 'human', true],
]

let failed = 0
for (const [input, owner, locked] of CASES) {
  const inp: SortInput = typeof input === 'string' ? { title: input } : input
  const r = classify(inp)
  const ok = r.owner === owner && (locked === undefined || r.locked === locked)
  if (!ok) failed++
  const mark = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`${mark} ${inp.title.padEnd(56)} ${r.owner.padEnd(8)} ${String(r.confidence).padEnd(5)} ${r.reason}${ok ? '' : `   (expected ${owner}${locked === undefined ? '' : locked ? ', locked' : ', unlocked'})`}`)
}

// Determinism + low-confidence default
const a = classify({ title: 'Untitled thing' })
const b = classify({ title: 'Untitled thing' })
if (a.owner !== 'human' || a.confidence > 0.3 || JSON.stringify(a) !== JSON.stringify(b)) {
  failed++
  console.log('\x1b[31m✗\x1b[0m default should be human, low confidence and deterministic')
}

console.log(`\n${CASES.length + 1 - failed}/${CASES.length + 1} passed`)
if (failed) process.exit(1)
