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
 *
 * Only active under `vite` (apply: 'serve'); a production build has no bridge and the app falls back
 * to export buttons.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

const MAX_BODY = 5 * 1024 * 1024
const PILES = ['human', 'manager', 'junior'] as const

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
      root = path.resolve(config.root, options.dir ?? 'piles')
    },
    configureServer(server) {
      const resultsDir = () => path.join(root, 'results')
      const processedDir = () => path.join(root, 'results', 'processed')

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (!url.startsWith('/api/piles')) return next()
        try {
          // ── health ──
          if (url === '/api/piles' && req.method === 'GET') {
            const pending = await listResultFiles(resultsDir())
            return send(res, 200, { ok: true, root: path.relative(server.config.root, root) || '.', pendingResults: pending.length })
          }

          // ── write the queue + checklists ──
          if (url === '/api/piles' && req.method === 'POST') {
            const body = (await readBody(req)) as { queue?: { tasks?: unknown }; markdown?: Record<string, unknown> }
            if (!body.queue || !Array.isArray(body.queue.tasks)) return send(res, 400, { ok: false, error: 'Missing queue.tasks' })
            await mkdir(resultsDir(), { recursive: true })
            await writeFile(path.join(root, 'queue.json'), JSON.stringify(body.queue, null, 2) + '\n')
            for (const pile of PILES) {
              const md = body.markdown?.[pile]
              if (typeof md === 'string') await writeFile(path.join(root, `${pile}.md`), md.endsWith('\n') ? md : md + '\n')
            }
            return send(res, 200, { ok: true, written: ['queue.json', ...PILES.map((p) => `${p}.md`)], count: body.queue.tasks.length })
          }

          // ── read agent results ──
          if (url === '/api/piles/results' && req.method === 'GET') {
            const files = await listResultFiles(resultsDir())
            const results: unknown[] = []
            const errors: { file: string; error: string }[] = []
            for (const file of files) {
              try {
                const data = JSON.parse(await readFile(path.join(resultsDir(), file), 'utf8'))
                if (!data || typeof data.taskId !== 'string' || !['review', 'returned', 'working'].includes(data.status)) {
                  errors.push({ file, error: 'Expected { taskId, status: review|returned|working, by, output }' })
                  continue
                }
                results.push({ ...data, file })
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
            for (const name of names) {
              const stamp = new Date().toISOString().replace(/[:.]/g, '-')
              try {
                await rename(path.join(resultsDir(), name), path.join(processedDir(), `${name.replace(/\.json$/, '')}.${stamp}.json`))
                moved.push(name)
              } catch {
                /* already moved */
              }
            }
            return send(res, 200, { ok: true, moved })
          }

          return send(res, 404, { ok: false, error: 'Unknown piles endpoint' })
        } catch (e) {
          return send(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Bridge error' })
        }
      })
    },
  }
}
