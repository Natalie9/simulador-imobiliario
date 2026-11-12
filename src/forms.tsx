import { type ReactNode } from 'react'
import type { Scenario } from './model.ts'
import { brl, DateField, dateLabel, Field, Numeric, Section, type Edit } from './ui.tsx'
import { closing } from './engine.ts'

type NumericKeys = { [K in keyof Scenario]: Scenario[K] extends number | null ? K : never }[keyof Scenario]
type DateKeys = 'signed' | 'purchase' | 'mortgageRelease' | 'bridgeSigned' | 'bridgeRelease' | 'firstPayment' | 'bridgeFirst'
type Props = { s: Scenario; edit: Edit }
const grid = (children: ReactNode) => <div className="fields">{children}</div>

function controls({ s, edit }: Props) {
  return {
    n: (key: NumericKeys, label: string, options: { optional?: boolean; hint?: string; min?: number; max?: number; step?: number } = {}) =>
      <Numeric key={key} label={label} value={s[key]} onChange={n => edit(key, n)} {...options} />,
    d: (key: DateKeys, label: string) => <DateField key={key} label={label} value={s[key]} onChange={value => edit(key, value)} />,
  }
}

export function Purchase({ s, edit, close }: Props & { close: ReturnType<typeof closing> | null }) {
  const { n, d } = controls({ s, edit })
  return <>
    <Section title="Imóvel e fechamento">
      {grid(<>{n('price', 'Preço do imóvel (R$)')}{n('mortgage', 'Principal imobiliário (R$)')}
        {n('capital', 'Capital próprio (R$)')}{d('purchase', 'Pagamento do imóvel')}{d('signed', 'Assinatura imobiliária')}
        {d('mortgageRelease', 'Liberação imobiliária')}{d('bridgeSigned', 'Assinatura do crédito complementar')}
        {d('bridgeRelease', 'Liberação do crédito complementar')}</>)}
      <h3>Despesas da compra</h3>
      <div className="list">{s.costs.map((item, index) => {
        const update = (patch: Partial<typeof item>) => edit('costs', s.costs.map((x, i) => i === index ? { ...x, ...patch } : x))
        return <div className="list-row" key={index}>
          <Field label="Despesa"><input value={item.label} onChange={e => update({ label: e.target.value })} /></Field>
          <DateField label="Vencimento" value={item.date} onChange={date => update({ date })} />
          <Numeric label="Valor (R$)" value={item.amount} onChange={amount => update({ amount: amount ?? NaN })} />
          <button className="remove" onClick={() => edit('costs', s.costs.filter((_, i) => i !== index))} aria-label={'Remover ' + item.label}>Remover</button>
        </div>
      })}</div>
      <button className="subtle" onClick={() => edit('costs', [...s.costs, { label: 'Nova despesa', date: s.purchase, amount: 0 }])}>+ Adicionar despesa</button>
      {close && <details className="detail"><summary>Cronograma de fechamento</summary>
        <div className="scroll"><table><thead><tr><th>Data</th><th>Movimentações</th><th>Caixa ao fim do dia</th></tr></thead>
          <tbody>{close.timeline.map(x => <tr key={x.date}><td>{dateLabel(x.date)}</td><td>{x.items.map(i => i.label + ' ' + brl(Math.abs(i.amount))).join(' · ')}</td>
            <td className={x.balance < 0 ? 'negative' : ''}>{brl(x.balance)}</td></tr>)}</tbody>
        </table></div></details>}
    </Section>
    <Section title="Proposta imobiliária">
      {grid(<><Field label="Tabela"><select value={s.mode} onChange={e => edit('mode', e.target.value as Scenario['mode'])}><option>Price</option><option>SAC</option></select></Field>
        {n('annual', 'Taxa efetiva anual (%)')}{n('term', 'Prazo (meses)', { min: 1, max: 600, step: 1 })}
        {d('firstPayment', 'Primeira parcela')}{n('housingQuote', 'Primeira prestação cotada (R$)', { optional: true })}
        {n('mortgageCet', 'CET anual informado (%)', { optional: true })}{n('mip', 'MIP mensal sobre saldo (%)', { optional: true })}
        {n('dfi', 'DFI mensal (R$)', { optional: true })}{n('fee', 'Tarifa mensal (R$)', { optional: true })}{n('tr', 'TR padrão mensal (%)', { max: 5 })}</>)}
      <details className="detail"><summary>Configurar TR por mês</summary>
        <div className="list">{s.trMonths.map((item, index) => {
          const update = (patch: Partial<typeof item>) => edit('trMonths', s.trMonths.map((x, i) => i === index ? { ...x, ...patch } : x))
          return <div key={index} className="list-row compact">
            <DateField label="Mês" type="month" value={item.date} onChange={date => update({ date })} />
            <Numeric label="TR (%)" value={item.rate} max={5} onChange={rate => update({ rate: rate ?? NaN })} />
            <button className="remove" onClick={() => edit('trMonths', s.trMonths.filter((_, i) => i !== index))}>Remover</button>
          </div>
        })}</div>
        <button className="subtle" onClick={() => edit('trMonths', [...s.trMonths, { date: s.firstPayment.slice(0, 7), rate: s.tr }])}>+ Adicionar mês</button>
      </details>
    </Section>
    <Section title="Crédito complementar">
      {grid(<>{n('bridgeRate', 'Taxa mensal (%)')}{n('bridgeTerm', 'Prazo (meses)', { min: 1, max: 600, step: 1 })}
        {d('bridgeFirst', 'Primeira parcela complementar')}
        <Field label="Tratamento do IOF"><select value={s.iofMode} onChange={e => edit('iofMode', e.target.value as Scenario['iofMode'])}>
          <option value="retido">Retido, preservando o líquido</option><option value="à parte">Pago à parte no fechamento</option><option value="cotado">Usar os valores da proposta</option>
        </select></Field>
        {s.iofMode === 'cotado' ? <>{n('quotedPrincipal', 'Principal cotado (R$)', { optional: true })}
          {n('quotedNet', 'Líquido cotado (R$)', { optional: true })}{n('quotedIof', 'IOF cotado (R$)', { optional: true })}</> :
          n('iof', 'IOF estimado (%)', { max: 99 })}
        {n('bridgeQuote', 'Parcela complementar cotada (R$)', { optional: true })}{n('bridgeCet', 'CET complementar informado (%)', { optional: true })}</>)}
    </Section>
  </>
}

export function Budget({ s, edit }: Props) {
  const { n } = controls({ s, edit })
  return <>
    <Section title="Receitas e despesas mensais">
      {grid(<>{n('income', 'Renda familiar total (R$)')}{n('grant', 'Bolsas incluídas na renda (R$)', { hint: 'Parcela da renda sujeita a atraso no estresse.' })}
        {n('spend', 'Despesas domésticas (R$)')}{n('verified', 'Renda comprovada (R$)')}{n('cap', 'Limite da proposta (%)', { max: 100 })}</>)}
    </Section>
    <Section title="Reserva de liquidez">
      {grid(<>{n('reserve', 'Reserva desejada (R$)')}{n('cdi', 'Rendimento líquido mensal (%)')}</>)}
    </Section>
    <Section title="Entradas pontuais" subtitle="Use a data estimada de disponibilidade. Os valores entram no fluxo do mês selecionado.">
      <div className="list">{s.events.map((item, index) => {
        const update = (patch: Partial<typeof item>) => edit('events', s.events.map((x, i) => i === index ? { ...x, ...patch } : x))
        return <div key={index} className="list-row event">
          <Field label="Entrada"><input value={item.label} onChange={e => update({ label: e.target.value })} /></Field>
          <DateField label="Disponibilidade" value={item.date} onChange={date => update({ date })} />
          <Numeric label="Valor (R$)" value={item.amount} onChange={amount => update({ amount: amount ?? NaN })} />
          <Field label="Destino"><select value={item.destination} onChange={e => update({ destination: e.target.value as typeof item.destination })}>
            <option value="dívida">Amortizar maior CET</option><option value="caixa">Manter em caixa</option>
          </select></Field>
          <button className="remove" onClick={() => edit('events', s.events.filter((_, i) => i !== index))} aria-label={'Remover ' + item.label}>Remover</button>
        </div>
      })}</div>
      <button className="subtle" onClick={() => edit('events', [...s.events, { label: 'Nova entrada', date: [s.firstPayment, s.bridgeFirst].sort()[0], amount: 0, destination: 'caixa' }])}>+ Adicionar entrada</button>
    </Section>
  </>
}

export function Stress({ s, edit, onRun, pending, result }: Props & {
  onRun: () => void; pending: boolean; result: { shortfalls: number; exhaustion: number } | null;
}) {
  const update = (patch: Partial<Scenario['stress']>) => edit('stress', { ...s.stress, ...patch })
  return <>
    <Section title="Atraso no recebimento das bolsas" subtitle="O atraso afeta apenas a parcela da renda identificada como bolsa.">
      {grid(<><DateField type="month" label="Primeiro mês afetado" value={s.stress.start} onChange={start => update({ start })} />
        <Field label="Duração do atraso"><select value={s.stress.delay} onChange={e => update({ delay: Number(e.target.value) as Scenario['stress']['delay'] })}>
          <option value="0">Sem atraso</option><option value="1">30 dias</option><option value="2">60 dias</option>
        </select></Field>
        <Field label="Recebimento após o atraso"><select value={s.stress.recovery ? 'sim' : 'não'} onChange={e => update({ recovery: e.target.value === 'sim' })}>
          <option value="sim">Receber as bolsas acumuladas</option><option value="não">Sem reposição no horizonte</option>
        </select></Field>
        {s.stress.recovery && <Field label="Mês da reposição" hint="Em branco, usa o primeiro mês após o atraso.">
          <input type="month" value={s.stress.recoveryMonth ?? ''} onChange={e => update({ recoveryMonth: e.target.value || null })} />
        </Field>}</>)}
    </Section>
    <Section title="Simulação probabilística" subtitle="Cada rodada sorteia um atraso no mês escolhido. Com duração desativada, a rodada usa 30 dias. A TR de cada rodada é sorteada uniformemente na faixa informada, respeitando os meses com taxa específica.">
      {grid(<><Numeric label="Probabilidade de atraso por rodada (%)" value={s.stress.probability} max={100} onChange={probability => update({ probability: probability ?? NaN })} />
        <Numeric label="Semente" value={s.stress.seed} max={4294967295} step={1} onChange={seed => update({ seed: seed ?? NaN })} />
        <Numeric label="TR mensal mínima (%)" value={s.stress.trMin} max={5} optional onChange={trMin => update({ trMin })} />
        <Numeric label="TR mensal máxima (%)" value={s.stress.trMax} max={5} optional onChange={trMax => update({ trMax })} /></>)}
      <button className="primary top-gap" disabled={pending} onClick={onRun}>{pending ? 'Calculando…' : 'Rodar 1.000 simulações'}</button>
      {result && <div className="notice" role="status">
        <strong>{result.shortfalls} de 1.000 com falta de caixa ({result.shortfalls / 10}%)</strong>
        <span>{result.exhaustion} de 1.000 esgotaram a reserva.</span>
      </div>}
    </Section>
  </>
}

