import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { prepare, simulate } from './engine.ts'
import { Budget, Purchase, Stress } from './forms.tsx'
import { MonthlyExpenses } from './monthly.tsx'
import { examples, validation, type Scenario } from './model.ts'
import { Alerts, csv, Overview, Results } from './results.tsx'
import { download, parseBackup, readScenarios, saveScenarios, shapeErrors } from './storage.ts'
import { brl, dateLabel, Field, Section, type Edit } from './ui.tsx'
import './style.css'

const tabs = ['Compra e propostas', 'Orçamento e reserva', 'Gastos mensais', 'Estresse', 'Resultados'] as const
const issues = (s: Scenario) => {
  const shape = shapeErrors(s)
  return shape.length ? shape : validation(s)
}

function App() {
  const [saved, setSaved] = useState(examples)
  const [drafts, setDrafts] = useState<Record<string, Scenario>>({})
  const [id, setId] = useState(examples[0].id)
  const [tab, setTab] = useState<typeof tabs[number]>('Resultados')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [compare, setCompare] = useState<string[]>([])
  const [mc, setMc] = useState<{ shortfalls: number; exhaustion: number } | null>(null)
  const [working, setWorking] = useState(false)
  const worker = useRef<Worker | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const s = drafts[id] ?? saved.find(x => x.id === id) ?? examples[0]
  useEffect(() => {
    readScenarios().then(items => setSaved([...examples.map(x => items.find(item => item.id === x.id) ?? x),
      ...items.filter(item => !examples.some(x => x.id === item.id))]))
      .catch(() => setStatus('O armazenamento local está indisponível. Use o backup JSON para guardar os cenários.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => () => { worker.current?.terminate() }, [])
  const errors = useMemo(() => issues(s), [s])
  const model = useMemo(() => {
    if (errors.length) return null
    const terms = prepare(s)
    return { terms, run: simulate(s, terms) }
  }, [s, errors])
  const comparable = useMemo(() => saved.filter(x => compare.includes(x.id) && x.id !== id).flatMap(x => {
    const scenario = drafts[x.id] ?? x
    if (issues(scenario).length) return []
    const terms = prepare(scenario)
    return [{ scenario, terms, run: simulate(scenario, terms, scenario.stress.delay, scenario.tr, true) }]
  }), [saved, drafts, compare, id])
  const resetStress = () => {
    worker.current?.terminate()
    worker.current = null
    setWorking(false)
    setMc(null)
  }
  const edit: Edit = (key, value) => {
    setDrafts(old => ({ ...old, [id]: { ...(old[id] ?? s), [key]: value } }))
    setStatus('')
    resetStress()
  }
  const select = (key: string) => {
    setId(key)
    setStatus('')
    resetStress()
  }
  const write = async (duplicate: boolean) => {
    if (errors.length || busy) return
    const next = duplicate ? { ...structuredClone(s), id: crypto.randomUUID(), name: (s.name.slice(0, 111) + ' · cópia') } : s
    setBusy(true)
    try {
      await saveScenarios([next])
      setSaved(old => duplicate ? [...old, next] : old.map(item => item.id === next.id ? next : item))
      if (!duplicate) setDrafts(old => {
        if (old[id] !== s) return old
        const copy = { ...old }
        delete copy[id]
        return copy
      })
      if (duplicate) select(next.id)
      setStatus(duplicate ? 'Cópia criada e salva.' : 'Cenário salvo neste navegador.')
    } catch {
      setStatus('Falha ao salvar. As alterações desta sessão podem ser exportadas em JSON.')
    } finally {
      setBusy(false)
    }
  }
  const backup = () => {
    const items = saved.map(x => drafts[x.id] ?? x)
    const invalid = items.find(x => issues(x).length)
    if (invalid) {
      setStatus('Corrija os campos do cenário “' + invalid.name + '” antes de exportar o backup.')
      return
    }
    download('cenarios-imobiliarios.json', JSON.stringify({ version: 1, scenarios: items }, null, 2), 'application/json')
    setStatus('Backup JSON exportado.')
  }
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    setBusy(true)
    try {
      if (selected.size > 8 * 1024 * 1024) throw new Error('O arquivo excede 8 MB.')
      const imported = parseBackup(await selected.text())
      if (imported.some(x => issues(x).length)) throw new Error('O backup contém cenários com premissas inválidas.')
      const copies = imported.map(x => ({ ...x, id: crypto.randomUUID() }))
      await saveScenarios(copies)
      setSaved(old => [...old, ...copies])
      select(copies[0].id)
      setStatus(copies.length + ' cenário(s) restaurado(s) como cópias.')
    } catch (error) {
      setStatus(error instanceof SyntaxError ? 'O arquivo selecionado não contém JSON válido.' : error instanceof Error ? error.message : 'Falha ao restaurar o backup.')
    } finally {
      setBusy(false)
    }
  }
  const runStress = () => {
    if (!model || working) return
    resetStress()
    const next = new Worker(new URL('./stress.worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    setWorking(true)
    next.onmessage = event => {
      setMc(event.data)
      setWorking(false)
      next.terminate()
      worker.current = null
    }
    next.onerror = () => {
      setWorking(false)
      setStatus('Não foi possível executar as simulações.')
      next.terminate()
      worker.current = null
    }
    next.postMessage(s)
  }
  return <>
    <header className="topbar"><div className="shell top-content">
      <div className="brand"><span className="brand-icon" aria-hidden="true">⌂</span><span>Viabilidade imobiliária</span></div>
      <div className="toolbar">
        <span className="local"><i /> Uso local</span>
        <button className="subtle" onClick={backup} disabled={loading}>Exportar backup</button>
        <button className="subtle" onClick={() => file.current?.click()} disabled={loading || busy}>Restaurar backup</button>
        <input hidden type="file" accept=".json,application/json" ref={file} onChange={importFile} />
      </div>
    </div></header>
    <main className="shell">
      <div className="intro">
        <div><p className="kicker">Compra, crédito e reserva</p><h1>Planejamento da compra</h1>
          <p>Simule o fechamento, o orçamento familiar e a quitação das dívidas.</p></div>
        <div className="scenario-control">
          <Field label="Cenário ativo"><select value={id} onChange={e => select(e.target.value)}>{saved.map(x =>
            <option value={x.id} key={x.id}>{(drafts[x.id] ?? x).name || 'Sem nome'}{drafts[x.id] ? ' *' : ''}</option>)}</select></Field>
          <div className="toolbar"><button className="subtle" disabled={loading || busy || !!errors.length} onClick={() => void write(true)}>Duplicar</button>
            <button className="primary" disabled={loading || busy || !!errors.length} onClick={() => void write(false)}>Salvar cenário</button></div>
        </div>
      </div>
      <div className="status" role="status">{status || (drafts[id] ? 'Alterações ainda não salvas.' : '')}</div>
      <nav className="tabs" aria-label="Seções do simulador">
        {tabs.map(t => <button key={t} aria-current={t === tab ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      <div className="print-title"><h2>{s.name}</h2><p>Resumo da simulação imobiliária</p></div>
      {errors.length > 0 && <div className="notice alert" role="alert"><strong>Revise os campos para recalcular</strong><ul>{errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
      {tab === 'Compra e propostas' && <>
        <Section title="Identificação do cenário"><div className="fields"><Field label="Nome do cenário">
          <input maxLength={120} value={s.name} onChange={e => edit('name', e.target.value)} />
        </Field></div></Section>
        <Purchase key={id} s={s} edit={edit} close={model?.terms.close ?? null} />
      </>}
      {tab === 'Orçamento e reserva' && <Budget key={id} s={s} edit={edit} />}
      {tab === 'Gastos mensais' && model && <MonthlyExpenses key={id} rows={model.run.rows} />}
      {tab === 'Estresse' && <>
        <Stress key={id} s={s} edit={edit} onRun={runStress} pending={working || !model} result={mc} />
        {model && <><Overview s={s} {...model} /><Alerts s={s} {...model} /></>}
      </>}
      {tab === 'Resultados' && model && <>
        <div className="result-head"><div><h2>{s.name}</h2><p>Projeção a partir de {dateLabel(model.run.rows[0]?.month ?? null)}</p></div>
          <div className="toolbar"><button className="subtle" onClick={() => download('fluxo-mensal.csv', csv(model.run.rows), 'text/csv;charset=utf-8')}>Exportar CSV</button>
            <button className="subtle" onClick={() => window.print()}>Imprimir resumo</button></div></div>
        <Overview s={s} {...model} />
        <Alerts s={s} {...model} />
        <Results key={id} s={s} {...model} />
        <Section title="Comparar cenários" subtitle="Selecione até três cenários adicionais. A tabela inclui as alterações da sessão.">
          <div className="compare-options">{saved.filter(x => x.id !== id).map(x =>
            <label key={x.id}><input type="checkbox" checked={compare.includes(x.id)}
              disabled={!compare.includes(x.id) && compare.filter(v => v !== id).length >= 3}
              onChange={e => setCompare(old => e.target.checked ? [...old.filter(v => v !== id), x.id] : old.filter(v => v !== x.id))} />
              {(drafts[x.id] ?? x).name}{issues(drafts[x.id] ?? x).length ? ' · premissas inválidas' : ''}</label>)}</div>
          {!!comparable.length && <div className="scroll"><table><thead><tr><th>Indicador</th>{[s, ...comparable.map(x => x.scenario)].map(x => <th key={x.id}>{x.name}</th>)}</tr></thead>
            <tbody>{[
              ['Desembolso inicial', ({ terms }: typeof model) => brl(terms.close.initial)],
              ['Pico de falta no fechamento', ({ terms }: typeof model) => brl(terms.close.peakGap)],
              ['Primeira prestação imobiliária', ({ terms }: typeof model) => brl(terms.firstHouse)],
              ['Sobra inicial', ({ run }: typeof model) => brl(run.firstSurplus)],
              ['Quitação complementar', ({ run, terms }: typeof model) => terms.close.principal ? dateLabel(run.bridgePaidOff) : 'Sem dívida'],
              ['Quitação imobiliária', ({ run }: typeof model) => dateLabel(run.housingPaidOff)],
              ['Custo líquido da reserva', ({ run }: typeof model) => brl(run.reserveCost)],
              ['Menor saldo de caixa e reserva', ({ run }: typeof model) => brl(run.minCash)],
              ['Pico de falta de caixa mensal', ({ run }: typeof model) => brl(run.peakGap)],
            ].map(([label, format]) => <tr key={String(label)}><th scope="row">{String(label)}</th>
              {[model, ...comparable].map((entry, i) => <td key={i}>{typeof format === 'function' && format(entry)}</td>)}</tr>)}</tbody></table></div>}
        </Section>
      </>}
      <footer>Os cenários de exemplo usam dados fictícios.</footer>
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<App />)

