import { useMemo, useState } from 'react'
import { noReserve, prepare, simulate, type Row } from './engine.ts'
import { cent, type Scenario } from './model.ts'
import { brl, Chart, dateLabel, decimal, Metric, pct, Section } from './ui.tsx'

type Projection = ReturnType<typeof simulate>
type Terms = ReturnType<typeof prepare>
const until = (date: string | null, principal: number) => principal === 0 ? 'Sem dívida' : date ? dateLabel(date) : 'Saldo em aberto'

const columns = [
  ['month', 'Mês'], ['income', 'Receita'], ['spend', 'Despesas pagas'], ['events', 'Entradas pontuais'],
  ['housingDue', 'Imóvel exigido'], ['housingPaid', 'Imóvel pago'], ['housingInterest', 'Juros imobiliários'],
  ['correction', 'Correção TR'], ['fees', 'Encargos do mês'], ['feesPaid', 'Encargos pagos'], ['housingExtra', 'Extra imóvel'],
  ['housing', 'Saldo imóvel'], ['bridgeDue', 'Complementar exigido'], ['bridgePaid', 'Complementar pago'],
  ['bridgeInterest', 'Juros complementar'], ['bridgeExtra', 'Extra complementar'], ['bridge', 'Saldo complementar'],
  ['reserve', 'Reserva'], ['reserveYield', 'Rendimento'], ['cash', 'Caixa livre'], ['shortfall', 'Falta de caixa'],
  ['expenseArrears', 'Despesas pendentes'], ['feeArrears', 'Encargos pendentes'], ['surplus', 'Sobra do mês'],
] as const satisfies readonly [keyof Row, string][]

export function csv(rows: Row[]) {
  return '\uFEFF' + [columns.map(([, label]) => label).join(';'), ...rows.map(row =>
    columns.map(([key]) => key === 'month' ? row[key] : row[key].toFixed(2).replace('.', ',')).join(';'))].join('\r\n')
}

export function Overview({ s, terms, run }: { s: Scenario; terms: Terms; run: Projection }) {
  const { close } = terms
  return <div className="overview">
    <Metric label="Desembolso inicial da compra" value={brl(close.initial)} detail={'Déficit base de ' + brl(close.deficit)} />
    <Metric label="Sobra no primeiro mês" value={brl(run.firstSurplus)} detail={'Crédito complementar de ' + brl(terms.bridgeRegular) + '/mês'} tone={run.firstSurplus < 0 ? 'warning' : ''} />
    <Metric label="Quitação do crédito complementar" value={terms.close.principal === 0 ? 'Sem dívida' : run.bridgeMonth ? run.bridgeMonth + ' meses' : 'Em aberto'}
      detail={run.bridgePaidOff ? dateLabel(run.bridgePaidOff) : undefined} />
    <Metric label="Custo líquido da reserva" value={brl(run.reserveCost)} detail={'Reserva inicial de ' + brl(close.reserve)} />
    <Metric label="Menor saldo de caixa e reserva" value={brl(run.minCash)} detail={run.firstShortfall ? 'Primeira falta em ' + dateLabel(run.firstShortfall) : s.stress.delay ? 'Inclui atraso simulado' : 'Cenário sem atraso'} tone={run.firstShortfall ? 'warning' : ''} />
  </div>
}

export function Alerts({ s, terms, run }: { s: Scenario; terms: Terms; run: Projection }) {
  const { close } = terms
  const warnings = [
    close.peakGap > 0 ? 'Faltam até ' + brl(close.peakGap) + ' nas datas de fechamento. Confira o cronograma em Compra e propostas.' : '',
    close.timeline.some(x => x.date > [s.firstPayment, s.bridgeFirst].sort()[0]) ? 'O cronograma de fechamento inclui movimentações depois da primeira parcela. Os resultados mensais usam o saldo final do fechamento.' : '',
    close.orderRisk ? 'O crédito complementar está previsto para o mesmo dia da assinatura imobiliária ou antes. Confira a ordem das contratações.' : '',
    terms.firstHouse > s.verified * s.cap / 100 ? 'A primeira prestação imobiliária supera o limite de ' + brl(s.verified * s.cap / 100) + ' configurado na proposta.' : '',
    close.reserve < s.reserve ? 'A reserva disponível no fechamento é de ' + brl(close.reserve) + '.' : '',
    run.firstShortfall ? 'Falta de caixa a partir de ' + dateLabel(run.firstShortfall) + ', com pico de ' + brl(run.peakGap) + '.' : '',
    run.firstExhausted ? 'A reserva se esgota em ' + dateLabel(run.firstExhausted) + '.' : '',
    s.iofMode === 'cotado' && cent(close.principal - close.net) > close.iof ? 'Parte da diferença entre principal e líquido cotados não está discriminada como IOF.' : '',
  ].filter(Boolean)
  const pending = [
    s.mip === null && 'MIP', s.dfi === null && 'DFI', s.fee === null && 'tarifa mensal',
    s.housingQuote === null && 'prestação imobiliária cotada', s.mortgageCet === null && 'CET imobiliário informado',
    s.bridgeCet === null && 'CET complementar informado', s.bridgeQuote === null && 'parcela complementar cotada',
  ].filter(Boolean)
  return <>
    {warnings.length > 0 && <div className="notice alert"><strong>Pontos de atenção</strong><ul>{warnings.map(x => <li key={x}>{x}</li>)}</ul></div>}
    {pending.length > 0 && <p className="assumptions">Dados pendentes na proposta · {pending.join(', ')}. Campos de encargos em branco entram como zero no cálculo base.</p>}
  </>
}

export function Results({ s, terms, run }: { s: Scenario; terms: Terms; run: Projection }) {
  const [page, setPage] = useState(0)
  const [windowType, setWindowType] = useState('dívida')
  const sensitivity = useMemo(() => Array.from({ length: 13 }, (_, i) => {
    const spend = cent(Math.max(0, s.spend - 3000) + 500 * i)
    return { spend, run: simulate({ ...s, spend }, terms, s.stress.delay, s.tr, true) }
  }), [s, terms])
  const baseline = useMemo(() => {
    const other = noReserve(s)
    if (!other) return null
    const terms = prepare(other)
    return { terms, run: simulate(other, terms) }
  }, [s])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(run.rows.length / 12) - 1))
  const rows = run.rows.slice(currentPage * 12, (currentPage + 1) * 12)
  const chartRows = windowType === 'reserva' ? run.rows.slice(0, 24) :
    run.rows.slice(0, Math.min(run.rows.length, Math.max(24, run.rows.findIndex(row => row.month === run.housingPaidOff) + 1) || 24))
  const plotRows = windowType === 'dívida' && !run.housingPaidOff ? run.rows : chartRows
  const values = (key: 'housing' | 'bridge' | 'reserve' | 'cash') => plotRows.map(r => r[key])
  const ordinaryLimit = cent(s.income - terms.firstHouse - terms.bridgeRegular)
  return <>
    <div className="split">
      <Section title="Evolução mensal">
        <div className="segmented" aria-label="Séries do gráfico">
          <button aria-pressed={windowType === 'dívida'} onClick={() => setWindowType('dívida')}>Dívidas</button>
          <button aria-pressed={windowType === 'reserva'} onClick={() => setWindowType('reserva')}>Liquidez · 24 meses</button>
        </div>
        <Chart title="Evolução dos saldos em reais" labels={plotRows.map(x => dateLabel(x.month))} series={windowType === 'dívida' ? [
          { name: 'Imobiliário', values: values('housing'), color: '#087b64' },
          { name: 'Complementar', values: values('bridge'), color: '#ac6027' },
        ] : [
          { name: 'Reserva', values: values('reserve'), color: '#087b64' },
          { name: 'Caixa livre', values: values('cash'), color: '#306486' },
        ]} />
      </Section>
      <Section title="Fechamento e parcelas">
        <dl className="stats">
          <dt>Entrada</dt><dd>{brl(terms.close.down)}</dd>
          <dt>Capital próprio necessário nas datas previstas</dt><dd>{brl(terms.close.ownRequired)}</dd>
          <dt>Crédito complementar bruto</dt><dd>{brl(terms.close.principal)}</dd>
          <dt>Crédito complementar líquido liberado</dt><dd>{brl(terms.close.net)}</dd>
          <dt>IOF estimado ou cotado</dt><dd>{brl(terms.close.iof)}</dd>
          <dt>Primeira prestação imobiliária</dt><dd>{brl(terms.firstHouse)}</dd>
          <dt>Maior prestação imobiliária na projeção</dt><dd>{brl(run.peakHousing)}</dd>
          <dt>Gasto doméstico de equilíbrio no início</dt><dd>{brl(ordinaryLimit)}</dd>
          <dt>Quitação imobiliária</dt><dd>{until(run.housingPaidOff, s.mortgage)}</dd>
        </dl>
      </Section>
    </div>
    <div className="split">
      <Section title="Custo da reserva">
        <dl className="stats">
          <dt>Juros atribuídos à reserva</dt><dd>{brl(run.reserveInterest)}</dd>
          <dt>IOF atribuído à reserva</dt><dd>{brl(run.reserveIof)}</dd>
          <dt>Rendimento da parte financiada até quitar o complementar ou fim da projeção</dt><dd>{brl(run.reserveYieldToPayoff)}</dd>
          <dt>Custo líquido da reserva</dt><dd>{brl(run.reserveCost)}</dd>
          <dt>Primeiro uso da reserva</dt><dd>{dateLabel(run.firstWithdrawal)}</dd>
          <dt>Mês de esgotamento</dt><dd>{dateLabel(run.firstExhausted)}</dd>
          {baseline && <>
            <dt>Variação no total pago em dívidas e IOF ante cenário com reserva zero</dt>
            <dd>{brl(run.totalPaid + terms.close.iofCash - baseline.run.totalPaid - baseline.terms.close.iofCash)}</dd>
            <dt>Quitação complementar com reserva zero</dt><dd>{until(baseline.run.bridgePaidOff, baseline.terms.close.principal)}</dd>
            <dt>Quitação imobiliária com reserva zero</dt><dd>{until(baseline.run.housingPaidOff, s.mortgage)}</dd>
          </>}
        </dl>
        {!baseline && <p className="muted">Para comparar com reserva zero, duplique o cenário e preencha uma cotação para o novo valor do empréstimo.</p>}
        {baseline && (s.bridgeQuote !== null || s.iofMode === 'cotado') &&
          <p className="muted">O cenário com reserva zero ajusta os valores cotados proporcionalmente ao crédito necessário.</p>}
        {baseline && (run.finalBridge > 0 || run.finalHousing > 0 || baseline.run.finalBridge > 0 || baseline.run.finalHousing > 0) &&
          <p className="muted">A comparação considera pagamentos dentro do horizonte. Há dívidas com saldo em aberto.</p>}
      </Section>
      <Section title="Sensibilidade aos gastos da casa">
        <Chart title="Custo líquido da reserva por gasto doméstico" labels={sensitivity.map(x => decimal(x.spend / 1000) + ' mil')}
          series={[{ name: 'Custo líquido da reserva', values: sensitivity.map(x => x.run.reserveCost), color: '#087b64' }]} />
        <details className="detail"><summary>Ver valores e prazos</summary>
          <div className="scroll"><table><thead><tr><th>Gasto doméstico</th><th>Quitação complementar</th><th>Custo líquido</th></tr></thead>
            <tbody>{sensitivity.map(x => <tr key={x.spend}><td>{brl(x.spend)}</td><td>{until(x.run.bridgePaidOff, terms.close.principal)}</td><td>{brl(x.run.reserveCost)}</td></tr>)}</tbody></table></div>
        </details>
      </Section>
    </div>
    <Section title="Cotações e hipóteses de cálculo">
      <div className="split">
        <dl className="stats">
          <dt>Imobiliário · primeira prestação calculada</dt><dd>{brl(terms.houseCalculated)}</dd>
          <dt>Diferença entre cotada e calculada</dt><dd>{s.housingQuote === null ? '—' : brl(terms.quoteDelta)}</dd>
          <dt>CET imobiliário simulado / informado</dt><dd>{pct(terms.mortgageCet)} / {pct(s.mortgageCet)}</dd>
          <dt>Saldo imobiliário no prazo final · contratual / projetado</dt><dd>{brl(terms.housingResidual)} / {brl(run.housingResidual)}</dd>
        </dl>
        <dl className="stats">
          <dt>Complementar · parcela calculada</dt><dd>{brl(terms.bridgeCalculated)}</dd>
          <dt>Diferença entre cotada e calculada</dt><dd>{s.bridgeQuote === null ? '—' : brl(s.bridgeQuote - terms.bridgeCalculated)}</dd>
          <dt>CET complementar simulado / informado</dt><dd>{pct(terms.bridgeCet)} / {pct(s.bridgeCet)}</dd>
          <dt>Saldo complementar no prazo final · contratual / projetado</dt><dd>{brl(terms.bridgeResidual)} / {brl(run.bridgeResidual)}</dd>
        </dl>
      </div>
      <details className="detail"><summary>Como o simulador trata as premissas</summary>
        <ul className="methods">
          <li>O saldo do fechamento agrupa liberações e vencimentos no mesmo dia. A projeção mensal parte do saldo final previsto, mesmo quando existe uma falta de caixa no cronograma.</li>
          <li>Quando a prestação imobiliária cotada supera a calculada, a diferença é projetada como encargo mensal estimado. Se for menor, reduz o pagamento regular. A TR corrige o saldo antes dos juros, e o SAC amortiza a cota original corrigida.</li>
          <li>O CET simulado usa as datas das parcelas, a liberação líquida, o IOF pago à parte, a avaliação bancária identificada pelo nome da despesa e o eventual saldo no último vencimento. Amortizações extraordinárias são mostradas no fluxo familiar.</li>
          <li>Os saldos usam juros contratuais. Encargos de atraso e custos de cobrança estão fora da projeção. Entradas destinadas à dívida cobrem primeiro eventual falta de caixa do próprio mês.</li>
        </ul>
      </details>
    </Section>
    <Section title="Fluxo mensal detalhado" subtitle="O CSV inclui todos os meses e os mesmos campos desta tabela.">
      <div className="scroll" tabIndex={0} aria-label="Tabela rolável do fluxo mensal"><table>
        <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.month}>{columns.map(([key]) =>
          <td key={key} className={key === 'shortfall' && row[key] > 0 ? 'negative' : ''}>{key === 'month' ? dateLabel(row[key]) : brl(row[key])}</td>)}</tr>)}</tbody>
      </table></div>
      <div className="pagination"><button className="subtle" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Anterior</button>
        <span>{currentPage * 12 + 1}–{Math.min(run.rows.length, (currentPage + 1) * 12)} de {run.rows.length} meses</span>
        <button className="subtle" disabled={(currentPage + 1) * 12 >= run.rows.length} onClick={() => setPage(currentPage + 1)}>Próxima</button></div>
    </Section>
  </>
}

