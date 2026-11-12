import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Scenario } from './model.ts'

export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format
export const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format
export const pct = (n: number | null) => n === null ? '—' : decimal(n) + '%'
export const dateLabel = (date: string | null) => date ? date.split('-').reverse().join('/') : '—'
export type Edit = <K extends keyof Scenario>(key: K, value: Scenario[K]) => void

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function Numeric({ label, value, onChange, optional, hint, min = 0, max, step = 'any' }: {
  label: string; value: number | null; onChange: (n: number | null) => void;
  optional?: boolean; hint?: string; min?: number; max?: number; step?: string | number;
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return <Field label={label} hint={hint}>
    <input type="number" min={min} max={max} step={step} value={draft ?? value ?? ''} placeholder={optional ? 'Pendente' : undefined}
      onBlur={() => setDraft(null)} onChange={e => {
        const raw = e.currentTarget.value
        setDraft(raw)
        onChange(raw === '' ? optional ? null : Number.NaN : Number(raw))
      }} />
  </Field>
}
export function DateField({ label, value, onChange, type = 'date' }: {
  label: string; value: string; onChange: (s: string) => void; type?: 'date' | 'month'
}) {
  return <Field label={label}><input type={type} value={value} onChange={e => onChange(e.target.value)} /></Field>
}
export function Section({ title, children, subtitle }: { title: string; children: ReactNode; subtitle?: string }) {
  return <section className="panel"><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}{children}</section>
}
export function Metric({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: string }) {
  return <article className={'metric ' + (tone ?? '')}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>
}

export type Series = { name: string; values: number[]; color: string }
export function Chart({ labels, series, title }: { labels: string[]; series: Series[]; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const id = useId()
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !labels.length) return
    const draw = () => {
      const width = canvas.clientWidth
      if (!width) return
      const ratio = window.devicePixelRatio || 1
      const height = canvas.clientHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(ratio, ratio)
      const left = width < 400 ? 56 : 66
      const right = width - 14
      const top = 20
      const bottom = height - 35
      const max = Math.max(1, ...series.flatMap(s => s.values))
      const min = Math.min(0, ...series.flatMap(s => s.values))
      const x = (i: number) => left + i * (right - left) / Math.max(1, labels.length - 1)
      const y = (n: number) => bottom - (n - min) * (bottom - top) / (max - min)
      ctx.font = '11px system-ui'
      ctx.textAlign = 'right'
      for (let i = 0; i <= 4; i++) {
        const value = min + (max - min) * i / 4
        ctx.strokeStyle = '#e2e8e3'
        ctx.beginPath()
        ctx.moveTo(left, y(value))
        ctx.lineTo(right, y(value))
        ctx.stroke()
        ctx.fillStyle = '#53635b'
        ctx.fillText(Math.abs(value) >= 1000 ? decimal(value / 1000) + ' mil' : decimal(value), left - 8, y(value) + 4)
      }
      const count = width < 480 ? 2 : 5
      ctx.textAlign = 'center'
      for (let i = 0; i <= Math.min(count, labels.length - 1); i++) {
        const index = Math.round(i * (labels.length - 1) / Math.min(count, labels.length - 1)) || 0
        ctx.fillText(labels[index], Math.min(right - 18, Math.max(left, x(index))), height - 12)
      }
      for (const s of series) {
        ctx.strokeStyle = s.color
        ctx.lineWidth = 2.5
        ctx.beginPath()
        s.values.forEach((value, i) => i ? ctx.lineTo(x(i), y(value)) : ctx.moveTo(x(i), y(value)))
        ctx.stroke()
        if (active !== null && s.values[active] !== undefined) {
          ctx.fillStyle = s.color
          ctx.beginPath()
          ctx.arc(x(active), y(s.values[active]), 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    draw()
    return () => observer.disconnect()
  }, [labels, series, active])
  return <figure className="chart" aria-label={title}>
    <div className="legend">{series.map(s => <span key={s.name} className={s.color === '#087b64' ? 'green' : s.color === '#ac6027' ? 'orange' : 'blue'}>{s.name}</span>)}</div>
    <canvas ref={ref} aria-hidden="true" onPointerMove={e => {
      const rect = e.currentTarget.getBoundingClientRect()
      const left = rect.width < 400 ? 56 : 66
      setActive(Math.max(0, Math.min(labels.length - 1, Math.round((e.clientX - rect.left - left) * (labels.length - 1) / (rect.width - left - 14)))))
    }} onPointerLeave={() => setActive(null)} />
    <figcaption id={id}>{active === null ? 'Valores em reais' :
      labels[active] + ' · ' + series.map(s => s.name + ' ' + brl(s.values[active])).join(' · ')}</figcaption>
  </figure>
}

