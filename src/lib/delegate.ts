/**
 * Delegation auto-sort: a deterministic, rule-based classifier that decides which pile a task
 * belongs to. You (the Chief Human Officer), the Manager agent or the Junior agent.
 *
 * Pure and dependency-free so it runs in the browser, in the Vite bridge and in `npm run test:sort`.
 *
 * 1. Hard human rules (calls, meetings, errands, money, booking, signing, sending as you, personal
 *    matters, decisions, logins) win outright and LOCK the task: agents can never be assigned it.
 * 2. Otherwise weighted keyword + tag rules score manager / junior / human; the best score wins.
 * 3. No signal at all → stays with you, low confidence.
 */
import type { Owner } from './types'

export interface SortInput {
  title: string
  tags?: string[]
  /** project name, a weak signal ("Personal", "Health"…) */
  project?: string | null
}

export interface SortResult {
  owner: Owner
  /** short, human-readable: "Phone call → needs you" */
  reason: string
  /** 0–1 */
  confidence: number
  /** true when a hard human rule matched: agents may never take this task */
  locked: boolean
}

interface HardRule {
  label: string
  words?: RegExp
  tags?: string[]
  /** if this also matches, the rule does not apply ("Draft a reply…" is drafting, not sending) */
  unless?: RegExp
}

interface ScoreRule {
  owner: Owner
  label: string
  weight: number
  words?: RegExp
  tags?: string[]
}

const PREP = /\b(draft|write|outline|template|agenda|notes|minutes|summar\w*|prep|prepare|brief|briefing|talking points|script|research|compare|options|shortlist|list of)\b/i

/** Order matters: the first matching hard rule supplies the reason. */
const HARD_HUMAN: HardRule[] = [
  { label: 'Needs your login', words: /\b(log ?in|sign ?in|password|passcode|credentials?|2fa|mfa|api key|bank account|reset (my )?password|verify (my )?account)\b/i },
  { label: 'Signature or ID', words: /\b(sign|signature|notari[sz]e|passport|visa|driver'?s licen[cs]e|id card|contract|vote)\b/i, unless: /\b(summar\w*|review|draft|outline|compare|template)\b/i },
  { label: 'Money moves', words: /\b(pay|payment|bill|invoice|transfer|wire|refund|donate|reimburse|venmo|tax return|file (my )?taxes)\b/i, unless: /\b(research|compare|analy[sz]e|summar\w*|draft|template)\b/i },
  { label: 'Purchase', words: /\b(buy|purchase|order|subscribe|renew)\b/i, unless: /\b(research|compare|options|shortlist|which|best|evaluate|draft|template)\b/i },
  { label: 'Booking', words: /\b(book|reserve|reservation|schedule|reschedule|rsvp|register|sign ?up|check ?in|cancel)\b/i, unless: /\b(research|compare|options|shortlist|draft|template|plan)\b/i },
  { label: 'Phone call', words: /\b(call|phone|ring|facetime|voicemail)\b/i, unless: PREP },
  { label: 'Meeting', words: /\b(meet|meeting|sync|1:1|one-on-one|stand-?up|interview|catch[ -]up|coffee with|lunch with|dinner with|attend|appointment)\b/i, tags: ['meeting', 'call'], unless: PREP },
  { label: 'Sends as you', words: /\b(send|reply|respond|e-?mail|dm|message|ping|follow up with|invite|tweet|publish|post on|announce to)\b|^text\b/i, tags: ['email'], unless: /\b(draft|write|outline|template|proofread|summar\w*|edit)\b/i },
  { label: 'In person', words: /\b(pick up|drop off|drive (to|over)|visit|go to|in person|deliver|return|walk the|water the|groceries|grocery|cook|meal prep|laundry|mow|vacuum|declutter|clean (the|out|my|up the (house|kitchen|garage|room))|tidy|repair|install|assemble|errand)\b/i, tags: ['errand', 'diy', 'chores'] },
  { label: 'Personal', words: /\b(mom|mum|dad|parents?|family|kids?|son|daughter|wife|husband|birthday|anniversary|wedding|doctor|dentist|therapy|therapist|gym|workout|yoga|meditat\w*|journal|sleep|medication|vitamins|prescription|haircut|date night|class)\b/i, tags: ['family', 'health', 'fitness', 'reflection', 'self-care', 'personal'] },
  { label: 'Your decision', words: /\b(decide|decision|approve|approval|sign[ -]off|choose|confirm|accept|hire|fire|negotiate)\b/i, unless: /\b(research|compare|options|shortlist|evaluate|pros and cons)\b/i },
]

const SCORE_RULES: ScoreRule[] = [
  // Manager: thinking work
  { owner: 'manager', label: 'Planning', weight: 3, words: /\b(plan|planning|game ?plan)\b/i },
  { owner: 'manager', label: 'Strategy', weight: 3, words: /\bstrateg\w*/i, tags: ['strategy'] },
  { owner: 'manager', label: 'Research', weight: 3, words: /\b(research|investigate|explore|deep ?dive)\b/i, tags: ['research'] },
  { owner: 'manager', label: 'Analysis', weight: 3, words: /\b(analy[sz]e|analysis|assess|audit|diagnose)\b/i },
  { owner: 'manager', label: 'Comparison', weight: 2, words: /\b(compare|comparison|versus|vs\.?|trade-?offs?|options|alternatives)\b/i },
  { owner: 'manager', label: 'Roadmap', weight: 3, words: /\broadmaps?\b/i, tags: ['roadmap'] },
  { owner: 'manager', label: 'Review', weight: 2, words: /\b(review|critique|feedback on)\b/i },
  { owner: 'manager', label: 'Prioritising', weight: 3, words: /\b(prioriti[sz]e|prioriti[sz]ation|triage|rank)\b/i },
  { owner: 'manager', label: 'Breaking down', weight: 3, words: /\b(break ?down|breakdown|decompose|scope|scoping|spec|requirements)\b/i },
  { owner: 'manager', label: 'Evaluation', weight: 3, words: /\b(evaluate|evaluation|benchmark|pros and cons)\b/i },
  { owner: 'manager', label: 'Proposal', weight: 3, words: /\b(proposal|business case|pitch|okrs?|forecast|budget)\b/i },
  { owner: 'manager', label: 'Prep work', weight: 1, words: /\b(prepare|prep)\b/i },
  { owner: 'manager', label: 'Metrics', weight: 1, words: /\b(metrics|kpis?|retro|retrospective)\b/i, tags: ['planning'] },

  // Junior: production work
  { owner: 'junior', label: 'Drafting', weight: 3, words: /\b(draft|write|rewrite|compose)\b/i, tags: ['writing', 'copy'] },
  { owner: 'junior', label: 'Summary', weight: 3, words: /\b(summari[sz]e|summary|tl;?dr|recap|digest)\b/i },
  { owner: 'junior', label: 'Outline', weight: 3, words: /\boutline\b/i },
  { owner: 'junior', label: 'Formatting', weight: 2, words: /\b(format|reformat|convert|clean up the (doc|data|sheet|list))\b/i },
  { owner: 'junior', label: 'List-making', weight: 2, words: /\b(list|compile|collect|gather|catalog|inventory)\b/i },
  { owner: 'junior', label: 'Lookup', weight: 2, words: /\b(find|look ?up|search for|source|look into)\b/i },
  { owner: 'junior', label: 'Proofreading', weight: 3, words: /\b(proofread|copy-?edit|polish|typos?)\b/i },
  { owner: 'junior', label: 'Template', weight: 3, words: /\b(template|boilerplate)\b/i },
  { owner: 'junior', label: 'Notes', weight: 2, words: /\b(notes|minutes|transcribe)\b/i, tags: ['docs'] },
  { owner: 'junior', label: 'Checklist', weight: 3, words: /\b(checklist|faq|glossary|cheat ?sheet)\b/i },
  { owner: 'junior', label: 'Copy', weight: 1, words: /\b(copy|blurb|bio|caption|press kit|announcement|changelog|newsletter|slides|deck|readme|docs)\b/i },

  // Soft human signals: things that are better done by you, without a hard lock
  { owner: 'human', label: 'Hands-on', weight: 2, words: /\b(read|watch|listen|practice|learn|think about|reflect|record|film|shoot|test|qa|try)\b/i, tags: ['fun', 'reading', 'video', 'qa'] },
]

const PERSONAL_PROJECTS = /^(personal|health|family|home|life)$/i

export const OWNER_LABEL: Record<Owner, string> = {
  human: 'You',
  manager: 'Manager agent',
  junior: 'Junior agent',
}

function arrow(owner: Owner) {
  return owner === 'human' ? 'needs you' : owner === 'manager' ? 'Manager' : 'Junior'
}

function tagHit(tags: string[], want?: string[]) {
  return !!want && tags.some((t) => want.includes(t))
}

export function classify(input: SortInput): SortResult {
  const title = input.title.trim()
  const tags = (input.tags ?? []).map((t) => t.toLowerCase())

  for (const r of HARD_HUMAN) {
    const hit = (r.words?.test(title) ?? false) || tagHit(tags, r.tags)
    if (hit && !(r.unless && r.unless.test(title))) {
      return { owner: 'human', reason: `${r.label} → needs you`, confidence: 0.95, locked: true }
    }
  }

  const score: Record<Owner, number> = { human: 0, manager: 0, junior: 0 }
  const best: Record<Owner, { label: string; w: number } | null> = { human: null, manager: null, junior: null }
  for (const r of SCORE_RULES) {
    const wordHit = r.words?.test(title) ?? false
    const tHit = tagHit(tags, r.tags)
    if (!wordHit && !tHit) continue
    // a word match is worth the full weight; a tag-only match a little less
    const w = wordHit ? r.weight : Math.max(1, r.weight - 1)
    score[r.owner] += w
    if (!best[r.owner] || w > best[r.owner]!.w) best[r.owner] = { label: r.label, w }
  }
  if (input.project && PERSONAL_PROJECTS.test(input.project.trim())) {
    score.human += 2
    if (!best.human) best.human = { label: `${input.project} project`, w: 2 }
  }

  // Highest score wins; ties prefer manager (it can always hand drafting down to the junior pile).
  const order: Owner[] = ['manager', 'junior', 'human']
  const ranked = [...order].sort((a, b) => score[b] - score[a])
  const top = ranked[0]
  const s1 = score[top]
  if (s1 === 0) {
    return { owner: 'human', reason: 'No clear agent signal → stays with you', confidence: 0.2, locked: false }
  }
  const s2 = score[ranked[1]]
  const confidence = Math.min(0.9, Math.max(0.3, 0.4 + 0.08 * s1 + 0.07 * (s1 - s2)))
  return { owner: top, reason: `${best[top]!.label} → ${arrow(top)}`, confidence: Math.round(confidence * 100) / 100, locked: false }
}

/** True when agents are allowed to take this task (no hard human rule matched). */
export function canDelegate(input: SortInput): boolean {
  return !classify(input).locked
}

/** The owner fields for an auto-sorted task. */
export function autoOwnerFields(input: SortInput): { owner: Owner; ownerSource: 'auto'; sortReason: string } {
  const r = classify(input)
  return { owner: r.owner, ownerSource: 'auto', sortReason: r.reason }
}
