import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import type { WeekBar } from '../lib/stats'
import { fromKey, prefersReducedMotion } from '../lib/utils'

export function WeeklyChart({ data }: { data: WeekBar[] }) {
  const animate = !prefersReducedMotion()
  return (
    <div className="h-[208px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} barCategoryGap="26%" margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="wk-done" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-hover)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.55} />
            </linearGradient>
            <linearGradient id="wk-today" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-hover)" stopOpacity={1} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={({ x, y, payload, index }) => {
              const today = data[index]?.isToday
              return (
                <text
                  x={x}
                  y={Number(y) + 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={today ? 600 : 400}
                  fill={today ? 'var(--text)' : 'var(--text-faint)'}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {today ? 'Today' : payload.value}
                </text>
              )
            }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fill: 'var(--text-faint)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
          />
          <Tooltip
            cursor={{ fill: 'var(--accent-soft)', radius: 6 } as object}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const row = payload[0].payload as WeekBar
              const rate = row.planned ? Math.round((row.completed / row.planned) * 100) : 0
              return (
                <div className="elevated rounded-row px-3 py-2 text-xs">
                  <div className="mb-1.5 font-medium text-fg">{format(fromKey(row.key), 'EEEE, d MMM')}</div>
                  <div className="tnum flex items-center gap-2 text-muted">
                    <span className="size-2 rounded-[2px] bg-accent" /> Completed{' '}
                    <span className="ml-auto pl-4 text-fg">{row.completed}</span>
                  </div>
                  <div className="tnum mt-1 flex items-center gap-2 text-muted">
                    <span className="size-2 rounded-[2px] border border-line-strong bg-surface-hover" /> Planned
                    <span className="ml-auto pl-4 text-fg">{row.planned}</span>
                  </div>
                  {row.planned > 0 && <div className="tnum mt-1.5 border-t border-line pt-1.5 text-faint">{rate}% follow-through</div>}
                </div>
              )
            }}
          />
          <Bar
            dataKey="planned"
            fill="var(--surface-hover)"
            stroke="var(--border-strong)"
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={animate}
            animationDuration={700}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="completed"
            fill="url(#wk-done)"
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={animate}
            animationDuration={900}
            animationBegin={120}
            animationEasing="ease-out"
          >
            {data.map((d) => (
              <Cell key={d.key} fill={d.isToday ? 'url(#wk-today)' : 'url(#wk-done)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
