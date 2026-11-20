import { Fragment, memo, type ReactNode } from 'react'

/**
 * A small, safe markdown renderer for agent output. It builds React elements (no innerHTML), so
 * nothing an agent writes can inject markup or script. Supports headings, paragraphs, bullet /
 * numbered / task lists, block quotes, fenced code, horizontal rules, simple tables, and inline
 * **bold**, *italic*, `code`, ~~strike~~ and [links](https://…).
 */
export const Markdown = memo(function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={className ?? 'agent-md'}>{renderBlocks(source.replace(/\r\n?/g, '\n'))}</div>
})

function renderBlocks(src: string): ReactNode[] {
  const lines = src.split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0
  const k = () => key++

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*([\w-]*)/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++])
      i++
      out.push(
        <pre key={k()}>
          <code>{body.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const level = Math.min(4, h[1].length)
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3' | 'h4')
      out.push(<Tag key={k()}>{inline(h[2].replace(/\s#+\s*$/, ''))}</Tag>)
      i++
      continue
    }

    // hr
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push(<hr key={k()} />)
      i++
      continue
    }

    // table: header | sep | rows
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const cells = (l: string) =>
        l
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]))
      out.push(
        <div key={k()} className="agent-md-table">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      out.push(<blockquote key={k()}>{renderBlocks(body.join('\n'))}</blockquote>)
      continue
    }

    // lists (one level of nesting via indentation)
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (li) {
      const ordered = /\d/.test(li[2])
      const items: { text: string; children: string[] }[] = []
      const baseIndent = li[1].length
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
        if (m && m[1].length <= baseIndent + 1) {
          items.push({ text: m[3], children: [] })
          i++
        } else if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
          items[items.length - 1].children.push(lines[i].replace(/^\s{2,4}/, ''))
          i++
        } else break
      }
      const ListTag = ordered ? 'ol' : 'ul'
      out.push(
        <ListTag key={k()}>
          {items.map((it, j) => {
            const task = it.text.match(/^\[([ xX])\]\s+(.*)$/)
            return (
              <li key={j} className={task ? 'task' : undefined}>
                {task ? (
                  <>
                    <span className={task[1] === ' ' ? 'box' : 'box on'} aria-label={task[1] === ' ' ? 'Not done' : 'Done'} />
                    <span>{inline(task[2])}</span>
                  </>
                ) : (
                  inline(it.text)
                )}
                {it.children.length > 0 && renderBlocks(it.children.join('\n'))}
              </li>
            )
          })}
        </ListTag>,
      )
      continue
    }

    // paragraph: until blank line or another block starts
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])
    )
      para.push(lines[i++].trim())
    if (!para.length) para.push(lines[i++].trim())
    out.push(
      <p key={k()}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && ' '}
            {inline(p)}
          </Fragment>
        ))}
      </p>,
    )
  }
  return out
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)]+)/g

function safeHref(href: string): string | null {
  return /^(https?:|mailto:)/i.test(href) ? href : null
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const t = m[0]
    if (m[1]) out.push(<code key={n++}>{t.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={n++}>{inline(t.slice(2, -2))}</strong>)
    else if (m[3]) out.push(<s key={n++}>{inline(t.slice(2, -2))}</s>)
    else if (m[4]) out.push(<em key={n++}>{inline(t.slice(1, -1))}</em>)
    else if (m[5]) {
      const lm = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
      const href = safeHref(lm[2])
      out.push(
        href ? (
          <a key={n++} href={href} target="_blank" rel="noreferrer noopener">
            {inline(lm[1])}
          </a>
        ) : (
          lm[1]
        ),
      )
    } else if (m[6]) {
      out.push(
        <a key={n++} href={t} target="_blank" rel="noreferrer noopener">
          {t}
        </a>,
      )
    }
    last = idx + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
