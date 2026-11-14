import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { calculate, check, defaults, type Inputs } from './simple.ts'
import { brl, Chart, Field, Metric, Numeric } from './ui.tsx'
import './style.css'

const KEY = 'simulador-simples-v1'

function load(): Inputs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    const merged = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof Inputs)[]) {
      const value = saved[key]
      if (key === 'mode') { if (value === 'Price' || value === 'SAC') merged.mode = value }
      else if (typeof value === 'number') merged[key] = value
    }
    return merged
  } catch {
    return defaults
  }
}

const span = (months: number) => {
  const years = Math.floor(months / 12)
  const rest = months % 12
  return [years && years + (years > 1 ? ' anos' : ' ano'), rest && rest + (rest > 1 ? ' meses' : ' mês')].filter(Boolean).join(' e ') || '0 meses'
}

const help: Partial<Record<keyof Inputs, string>> = {
  price: 'Preço combinado com o vendedor.',
  mortgage: 'Parte do preço que o banco financia. O restante é a entrada.',
  capital: 'Dinheiro que você já tem para a entrada e as despesas.',
  costs: 'Soma de ITBI, registro, avaliação bancária, mudança e pequenas reformas.',
  annual: 'Taxa efetiva anual da proposta do banco.',
  term: 'Prazo do financiamento em meses (ex.: 360 = 30 anos).',
  bridgeRate: 'Juros mensais do empréstimo pessoal usado para completar a entrada.',
  bridgeTerm: 'Número de parcelas do empréstimo pessoal.',
  iof: 'Imposto cobrado na contratação do empréstimo. Fica embutido no valor emprestado.',
  income: 'Tudo o que entra por mês na casa.',
  spend: 'Gastos da casa sem as parcelas: mercado, contas, transporte, escola.',
  reserve: 'Valor extra pego no empréstimo para deixar guardado para imprevistos.',
  cdi: 'Quanto a reserva rende por mês, já descontado o imposto.',
  fgts: 'Valor do FGTS que você poderá usar para abater dívida. Deixe zero se não houver.',
  fgtsMonth: 'Em que mês depois da compra o FGTS fica disponível.',
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="group"><legend>{title}</legend><div className="fields">{children}</div></fieldset>
}

function App() {
  const [inputs, setInputs] = useState(load)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inputs)) } catch { /* sem armazenamento: segue sem salvar */ } }, [inputs])
  const errors = useMemo(() => check(inputs), [inputs])
  const result = useMemo(() => errors.length ? null : calculate(inputs), [inputs, errors])
  const n = (key: Exclude<keyof Inputs, 'mode'>, label: string, extra: { step?: number; max?: number } = {}) =>
    <Numeric label={label} value={inputs[key]} hint={help[key]} {...extra}
      onChange={value => setInputs(old => ({ ...old, [key]: value ?? NaN }))} />

  return <>
    <header className="topbar"><div className="shell top-content">
      <div className="brand"><span className="brand-icon" aria-hidden="true">⌂</span><span>Simulador imobiliário</span></div>
      <button className="subtle" onClick={() => setInputs(defaults)}>Voltar ao exemplo</button>
    </div></header>
    <main className="shell layout">
      <form className="inputs" onSubmit={e => e.preventDefault()}>
        <Group title="Imóvel">
          {n('price', 'Preço do imóvel (R$)')}
          {n('mortgage', 'Valor financiado (R$)')}
          {n('capital', 'Dinheiro disponível (R$)')}
          {n('costs', 'Despesas da compra (R$)')}
        </Group>
        <Group title="Financiamento">
          <Field label="Tabela" hint="Price: parcela fixa. SAC: começa mais alta e diminui todo mês.">
            <select value={inputs.mode} onChange={e => setInputs(old => ({ ...old, mode: e.target.value as Inputs['mode'] }))}>
              <option>Price</option><option>SAC</option>
            </select>
          </Field>
          {n('annual', 'Juros ao ano (%)')}
          {n('term', 'Prazo (meses)', { step: 1, max: 600 })}
        </Group>
        <Group title="Empréstimo para completar">
          {n('bridgeRate', 'Juros ao mês (%)')}
          {n('bridgeTerm', 'Prazo (meses)', { step: 1, max: 600 })}
          {n('iof', 'IOF (%)', { max: 99 })}
        </Group>
        <Group title="Orçamento da família">
          {n('income', 'Renda mensal (R$)')}
          {n('spend', 'Gastos da casa (R$)')}
          {n('reserve', 'Reserva para imprevistos (R$)')}
          {n('cdi', 'Rendimento da reserva ao mês (%)')}
        </Group>
        <Group title="FGTS">
          {n('fgts', 'Valor do FGTS (R$)')}
          {n('fgtsMonth', 'Disponível no mês', { step: 1, max: 600 })}
        </Group>
      </form>

      <section className="results" aria-live="polite">
        {errors.length > 0 && <div className="notice alert" role="alert"><strong>Revise os campos</strong>
          <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
        {result && <Results inputs={inputs} result={result} />}
      </section>
    </main>
  </>
}

function Results({ inputs, result }: { inputs: Inputs; result: ReturnType<typeof calculate> }) {
  const { terms, run, housingMonth } = result
  const { close } = terms
  const hasLoan = close.principal > 0
  const surplus = run.firstSurplus
  const limit = inputs.income * .3
  const monthOf = (date: string | null) => run.rows.findIndex(r => r.month === date) + 1
  // Quando falta dinheiro para as parcelas, a projeção deixa de ser um plano viável: mostramos só o limite de gastos.
  const broken = run.firstShortfall !== null
  const maxSpend = Math.max(0, inputs.income - terms.firstHouse - terms.bridgeRegular)
  const notes = [
    !broken && surplus < 0 && 'Os gastos e as parcelas passam da renda em ' + brl(-surplus) + ' por mês. A diferença sai da reserva.',
    terms.firstHouse > limit && 'A parcela do imóvel (' + brl(terms.firstHouse) + ') passa de 30% da renda (' + brl(limit) + '). Os bancos costumam limitar a esse valor.',
  ].filter(Boolean) as string[]
  const rows = useMemo(() => housingMonth ? run.rows.slice(0, housingMonth) : run.rows, [run, housingMonth])
  const series = useMemo(() => [
    { name: 'Saldo do financiamento', values: rows.map(r => r.housing), color: '#087b64' },
    ...(hasLoan ? [{ name: 'Saldo do empréstimo', values: rows.map(r => r.bridge), color: '#ac6027' }] : []),
  ], [rows, hasLoan])
  const labels = useMemo(() => rows.map((_, i) => 'Mês ' + (i + 1)), [rows])

  return <>
    <div className="overview">
      <Metric label="Sobra por mês" value={brl(surplus)} tone={surplus < 0 ? 'warning' : ''}
        detail={surplus < 0 ? 'Renda não cobre as despesas' : 'Vai toda para quitar as dívidas mais cedo'} />
      <Metric label="Parcela do imóvel" value={brl(terms.firstHouse)}
        detail={inputs.mode === 'Price' ? 'Fixa' : 'Primeira parcela; depois diminui'} />
      <Metric label="Empréstimo para completar" value={hasLoan ? brl(close.principal) : 'Não precisa'}
        detail={hasLoan ? brl(terms.bridgeRegular) + '/mês em ' + inputs.bridgeTerm + ' parcelas' : 'O dinheiro disponível cobre tudo'} />
      <Metric label="Empréstimo quitado em" value={broken || !hasLoan || !run.bridgeMonth ? '—' : span(run.bridgeMonth)}
        detail={!broken && hasLoan ? 'Prazo do contrato: ' + span(inputs.bridgeTerm) : undefined} />
      <Metric label="Imóvel quitado em" value={broken || !housingMonth ? '—' : span(housingMonth)}
        detail={!broken && housingMonth && housingMonth < inputs.term ? span(inputs.term - housingMonth) + ' antes do prazo' : 'Prazo do contrato: ' + span(inputs.term)} />
      <Metric label="Custo da reserva" value={broken ? '—' : brl(run.reserveCost)}
        detail="Juros e IOF da reserva menos o que ela rende" />
    </div>

    {broken && <div className="notice alert" role="alert"><strong>O orçamento não fecha</strong>
      <p>A partir do mês {monthOf(run.firstShortfall)}{run.firstExhausted ? ', depois de a reserva acabar,' : ''} falta dinheiro para pagar as parcelas.
        Para o plano funcionar, os gastos da casa precisam ficar abaixo de <strong>{brl(maxSpend)}</strong> por mês, ou a renda precisa aumentar.</p></div>}

    {notes.length > 0 && <div className="notice alert"><strong>Pontos de atenção</strong><ul>{notes.map(x => <li key={x}>{x}</li>)}</ul></div>}

    {!broken && <div className="panel">
      <h2>Quanto falta pagar ao longo do tempo</h2>
      <Chart title="Saldo das dívidas" labels={labels} series={series} />
    </div>}

    <div className="panel">
      <h2>Resumo da compra</h2>
      <dl className="stats">
        <dt>Entrada</dt><dd>{brl(close.down)}</dd>
        <dt>Despesas da compra</dt><dd>{brl(close.costs)}</dd>
        <dt>Total a pagar na compra</dt><dd>{brl(close.initial)}</dd>
        <dt>Dinheiro disponível</dt><dd>{brl(inputs.capital)}</dd>
        <dt>Falta para fechar a compra</dt><dd>{brl(close.deficit)}</dd>
        <dt>Reserva guardada após a compra</dt><dd>{brl(close.reserve)}</dd>
        {hasLoan && <dt>IOF do empréstimo</dt>}{hasLoan && <dd>{brl(close.iof)}</dd>}
        {!broken && <>
          {hasLoan && <><dt>Juros pagos no empréstimo</dt><dd>{brl(run.bridgeInterestTotal)}</dd></>}
          <dt>Juros pagos no financiamento</dt><dd>{brl(run.housingInterestTotal)}</dd></>}
      </dl>
      <details className="detail"><summary>Como o cálculo funciona</summary>
        <ul className="methods">
          <li>O empréstimo cobre o que falta para a compra mais a reserva. O IOF é somado ao valor emprestado.</li>
          <li>Toda sobra do mês vai para quitar o empréstimo. Depois que ele acaba, a sobra e a parcela liberada vão para o financiamento.</li>
          <li>O FGTS abate primeiro a dívida mais cara.</li>
          <li>Não entram TR, seguros e tarifas do banco. Use os valores da proposta para conferir a parcela.</li>
        </ul>
      </details>
    </div>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)
