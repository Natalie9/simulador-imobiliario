import { useState } from 'react'
import type { Row } from './engine.ts'
import { cent } from './model.ts'
import { brl, Chart, dateLabel, Field, Section } from './ui.tsx'

const monthsPerPeriod = 12

export function MonthlyExpenses({ rows }: { rows: Row[] }) {
  const [page, setPage] = useState(0)
  const [view, setView] = useState<'due' | 'paid'>('due')
  const periodCount = Math.ceil(rows.length / monthsPerPeriod)
  const period = Math.min(page, periodCount - 1)
  const periodLabel = (i: number) =>
    dateLabel(rows[i * monthsPerPeriod].month) + ' a ' +
    dateLabel(rows[Math.min(rows.length, (i + 1) * monthsPerPeriod) - 1].month)
  const months = rows.slice(period * monthsPerPeriod, (period + 1) * monthsPerPeriod).map(row => {
    const house = view === 'due' ? row.spendDue : row.spend
    const loan = view === 'due' ? row.bridgeDue : row.bridgePaid
    const mortgage = view === 'due' ? row.housingDue + row.feesDue : row.housingPaid + row.feesPaid
    return { ...row, house, loan, mortgage, total: cent(house + loan + mortgage), extra: cent(row.bridgeExtra + row.housingExtra) }
  })
  return <Section title="Evolução dos gastos mensais">
    <div className="monthly-controls">
      <Field label="Período"><select value={period} onChange={e => setPage(Number(e.target.value))}>
        {Array.from({ length: periodCount }, (_, i) => <option key={i} value={i}>{periodLabel(i)}</option>)}
      </select></Field>
      <div className="segmented" aria-label="Valores do gráfico e da tabela">
        <button aria-pressed={view === 'due'} onClick={() => setView('due')}>A pagar</button>
        <button aria-pressed={view === 'paid'} onClick={() => setView('paid')}>Pagos na simulação</button>
      </div>
    </div>
    <p className="muted monthly-note">
      {view === 'due'
        ? 'Valores exigidos no mês, incluindo eventuais atrasos acumulados. O financiamento imobiliário inclui encargos.'
        : 'Valores que o caixa consegue cobrir na simulação. As amortizações extras aparecem separadamente.'}
    </p>
    <Chart key={period} title="Gastos da casa e parcelas mês a mês" labels={months.map(row => dateLabel(row.month))} series={[
      { name: 'Gastos da casa', color: '#087b64', values: months.map(row => row.house) },
      { name: 'Empréstimo complementar', color: '#ac6027', values: months.map(row => row.loan) },
      { name: 'Financiamento imobiliário', color: '#306486', values: months.map(row => row.mortgage) },
    ]} />
    <div className="scroll monthly-table" tabIndex={0} aria-label="Tabela de gastos mensais">
      <table>
        <thead><tr>
          <th scope="col">Mês</th><th scope="col">Gastos da casa</th><th scope="col">Parcela do empréstimo</th>
          <th scope="col">Parcela imobiliária</th><th scope="col">{view === 'due' ? 'Total a pagar' : 'Total pago sem extras'}</th>
          <th scope="col">{view === 'due' ? 'Falta de caixa' : 'Amortizações extras'}</th>
        </tr></thead>
        <tbody>{months.map(row => <tr key={row.month}>
          <th scope="row">{dateLabel(row.month)}</th><td>{brl(row.house)}</td><td>{brl(row.loan)}</td>
          <td>{brl(row.mortgage)}</td><td><strong>{brl(row.total)}</strong></td>
          <td className={view === 'due' && row.shortfall > 0 ? 'negative' : undefined}>{brl(view === 'due' ? row.shortfall : row.extra)}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </Section>
}
