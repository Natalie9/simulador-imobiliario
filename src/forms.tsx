import { type ReactNode } from 'react'
import type { Scenario } from './model.ts'
import { brl, DateField, dateLabel, Field, Numeric, Section, type Edit } from './ui.tsx'
import { closing } from './engine.ts'

type NumericKeys = { [K in keyof Scenario]: Scenario[K] extends number | null ? K : never }[keyof Scenario]
type DateKeys = 'signed' | 'purchase' | 'mortgageRelease' | 'bridgeSigned' | 'bridgeRelease' | 'firstPayment' | 'bridgeFirst'
type Props = { s: Scenario; edit: Edit }
const grid = (children: ReactNode) => <div className="fields">{children}</div>

const help: Partial<Record<NumericKeys | DateKeys, string>> = {
  price: 'Preço total combinado com o vendedor, antes de somar as despesas da compra.',
  mortgage: 'Parte do preço do imóvel que o banco vai financiar. A diferença entre esse valor e o preço é a entrada.',
  capital: 'Dinheiro que você já tem disponível para a compra e as despesas iniciais.',
  purchase: 'Data prevista para pagar ao vendedor o valor da compra.',
  signed: 'Data em que você e o banco assinam o contrato do financiamento do imóvel.',
  mortgageRelease: 'Data em que o banco prevê liberar o valor financiado para pagar o vendedor. O simulador usa essa data para verificar se o dinheiro chega a tempo.',
  bridgeSigned: 'Data em que você contrata o empréstimo usado para complementar o dinheiro da compra.',
  bridgeRelease: 'Data em que o dinheiro do empréstimo complementar fica disponível na sua conta.',
  annual: 'Taxa efetiva de juros do financiamento por ano. Informe o percentual da proposta.',
  term: 'Quantidade de meses prevista no contrato do financiamento.',
  firstPayment: 'Data de vencimento da primeira parcela do financiamento do imóvel.',
  housingQuote: 'Valor total da primeira parcela na proposta do banco, com seguros e tarifas quando incluídos.',
  mortgageCet: 'Custo Efetivo Total anual informado pelo banco, incluindo juros, tarifas e outros encargos.',
  mip: 'Taxa mensal do seguro por morte e invalidez permanente aplicada ao saldo devedor.',
  dfi: 'Valor mensal do seguro contra danos físicos ao imóvel.',
  fee: 'Valor cobrado mensalmente pelo banco para administrar o financiamento.',
  tr: 'Taxa Referencial mensal usada para corrigir o saldo devedor nos meses sem taxa específica.',
  bridgeRate: 'Juros cobrados a cada mês sobre o saldo do empréstimo complementar.',
  bridgeTerm: 'Quantidade de parcelas mensais prevista no contrato do empréstimo complementar.',
  bridgeFirst: 'Data de vencimento da primeira parcela do empréstimo complementar.',
  quotedPrincipal: 'Valor total do empréstimo registrado na proposta, antes de descontos na liberação.',
  quotedNet: 'Valor que efetivamente entra na sua conta após os descontos da liberação.',
  quotedIof: 'Valor do Imposto sobre Operações Financeiras informado na proposta.',
  iof: 'Percentual usado para estimar o imposto sobre o empréstimo complementar.',
  bridgeQuote: 'Valor da parcela mensal informado pela instituição que oferece o empréstimo.',
  bridgeCet: 'Custo Efetivo Total anual do empréstimo complementar informado na proposta.',
  income: 'Soma das receitas mensais que a família espera receber, incluindo bolsas.',
  spend: 'Gastos mensais da casa, como alimentação, contas e transporte. As parcelas são calculadas à parte.',
  verified: 'Parcela da renda que você consegue comprovar para a análise do banco.',
  cap: 'Percentual máximo da renda comprovada que a proposta permite comprometer com a parcela imobiliária.',
  reserve: 'Valor que você deseja manter disponível após a compra para cobrir imprevistos.',
  cdi: 'Percentual estimado de rendimento da reserva por mês, depois dos impostos.',
}

function controls({ s, edit }: Props) {
  return {
    n: (key: NumericKeys, label: string, options: { optional?: boolean; hint?: string; min?: number; max?: number; step?: number } = {}) =>
      <Numeric key={key} label={label} value={s[key]} hint={help[key]} onChange={n => edit(key, n)} {...options} />,
    d: (key: DateKeys, label: string) => <DateField key={key} label={label} value={s[key]} hint={help[key]} onChange={value => edit(key, value)} />,
  }
}

export function Purchase({ s, edit, close }: Props & { close: ReturnType<typeof closing> | null }) {
  const { n, d } = controls({ s, edit })
  return <>
    <Section title="Compra do imóvel">
      {grid(<>{n('price', 'Preço do imóvel (R$)')}{n('mortgage', 'Valor financiado pelo banco (R$)')}
        {n('capital', 'Dinheiro disponível para a compra (R$)')}{d('purchase', 'Data de pagamento ao vendedor')}{d('signed', 'Assinatura do financiamento')}
        {d('mortgageRelease', 'Liberação do financiamento pelo banco')}{d('bridgeSigned', 'Assinatura do empréstimo complementar')}
        {d('bridgeRelease', 'Liberação do empréstimo complementar')}</>)}
      <h3>Despesas da compra</h3>
      <div className="list">{s.costs.map((item, index) => {
        const update = (patch: Partial<typeof item>) => edit('costs', s.costs.map((x, i) => i === index ? { ...x, ...patch } : x))
        return <div className="list-row" key={index}>
          <Field label="Despesa" hint="Nome do custo da compra, como avaliação, imposto ou registro."><input value={item.label} onChange={e => update({ label: e.target.value })} /></Field>
          <DateField label="Vencimento" hint="Dia em que você precisa ter dinheiro disponível para pagar esta despesa." value={item.date} onChange={date => update({ date })} />
          <Numeric label="Valor da despesa (R$)" hint="Valor a pagar nessa data." value={item.amount} onChange={amount => update({ amount: amount ?? NaN })} />
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
    <Section title="Financiamento do imóvel">
      {grid(<><Field label="Sistema de amortização" hint="A tabela Price tende a ter parcelas mais estáveis. No SAC, a amortização é constante e a parcela tende a cair."><select value={s.mode} onChange={e => edit('mode', e.target.value as Scenario['mode'])}><option>Price</option><option>SAC</option></select></Field>
        {n('annual', 'Juros efetivos ao ano (%)')}{n('term', 'Prazo (meses)', { min: 1, max: 600, step: 1 })}
        {d('firstPayment', 'Vencimento da primeira parcela')}{n('housingQuote', 'Primeira parcela na proposta (R$)', { optional: true })}
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
    <Section title="Empréstimo complementar">
      {grid(<>{n('bridgeRate', 'Taxa mensal (%)')}{n('bridgeTerm', 'Prazo (meses)', { min: 1, max: 600, step: 1 })}
        {d('bridgeFirst', 'Primeira parcela complementar')}
        <Field label="Como o IOF é cobrado" hint="Informe se o imposto será descontado do valor liberado, pago à parte ou preenchido com os valores da proposta."><select value={s.iofMode} onChange={e => edit('iofMode', e.target.value as Scenario['iofMode'])}>
          <option value="retido">Retido, preservando o líquido</option><option value="à parte">Pago à parte no fechamento</option><option value="cotado">Usar os valores da proposta</option>
        </select></Field>
        {s.iofMode === 'cotado' ? <>{n('quotedPrincipal', 'Valor total na proposta (R$)', { optional: true })}
          {n('quotedNet', 'Valor a receber na conta (R$)', { optional: true })}{n('quotedIof', 'IOF na proposta (R$)', { optional: true })}</> :
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

