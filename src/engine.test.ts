import test from 'node:test'
import assert from 'node:assert/strict'
import { closing, monteCarlo, noReserve, prepare, simulate } from './engine.ts'
import { cent, examples, payment } from './model.ts'
import { parseBackup } from './storage.ts'

const sample = () => structuredClone(examples[0])

test('compra e crédito retido preservam o valor líquido e quitam no mês 13', () => {
  const s = sample()
  const terms = prepare(s)
  const run = simulate(s, terms)
  assert.equal(terms.close.initial, 86600)
  assert.equal(terms.close.deficit, 20600)
  assert.equal(terms.close.principal, 31095.04)
  assert.equal(terms.close.net, 30100)
  assert.equal(terms.close.iof, 995.04)
  assert.equal(terms.bridgeRegular, 1142.97)
  assert.equal(terms.firstHouse, 3300)
  assert.equal(run.firstSurplus, 1657.03)
  assert.equal(run.bridgeMonth, 13)
  assert.equal(run.rows[12].housingExtra, 0)
  assert.ok(run.rows[13].housingExtra > 0)
  assert.equal(cent(payment(1200, 0, 12)), 100)
  assert.equal(closing(examples[2]).initial, 86200)
})

test('taxa zero, reserva zero e IOF à parte', () => {
  const s = { ...sample(), bridgeRate: 0, reserve: 0, iof: 0 }
  assert.equal(prepare(s).bridgeRegular, 572.22)
  assert.equal(simulate(s).reserveCost, 0)
  const alternative = closing({ ...sample(), iofMode: 'à parte' })
  assert.equal(alternative.iofCash, 963.2)
  assert.equal(alternative.reserve, 8536.8)
  assert.equal(noReserve(sample())?.reserve, 0)
})

test('descasamento de datas sinaliza o pico de falta mesmo com fechamento positivo', () => {
  const close = closing({ ...sample(), bridgeRelease: '2027-05-20', bridgeSigned: '2027-05-05' })
  assert.equal(close.peakGap, 20600)
  assert.equal(close.balance, 9500)
  assert.equal(close.orderRisk, true)
})

test('cotação com parcela baixa preserva saldo residual contratual e projetado', () => {
  const s = { ...sample(), bridgeQuote: 10, bridgeTerm: 2, spend: 14300, events: [] }
  const terms = prepare(s)
  assert.ok(terms.bridgeResidual > terms.close.principal)
  assert.ok(simulate(s, terms).bridgeResidual > terms.close.principal)
})

test('atraso de 60 dias esgota a reserva e a reposição posterior recupera a receita', () => {
  const s = sample()
  s.stress = { ...s.stress, delay: 2, recoveryMonth: '2027-10' }
  const result = simulate(s)
  assert.equal(result.rows[1].income, 2500)
  assert.equal(result.rows[2].income, 2500)
  assert.equal(result.rows[3].income, 12500)
  assert.equal(result.rows[4].income, 32500)
  assert.equal(result.firstExhausted, '2027-08')
  assert.equal(result.firstShortfall, '2027-08')
  assert.ok(result.rows[2].expenseArrears >= 0)
})

test('entrada extra prioriza o crédito de maior CET com saldo e redireciona o restante', () => {
  const s = sample()
  s.events = [{ ...s.events[0], date: '2027-06-10', amount: 100000 }]
  const run = simulate(s)
  assert.equal(run.bridgeMonth, 1)
  assert.equal(run.rows[0].bridge, 0)
  assert.ok(run.rows[0].housingExtra > 0)
  assert.ok(run.rows[0].housingExtra < 100000)
  const ordinary = simulate(sample())
  assert.equal(ordinary.rows.find(r => r.month === '2029-01')?.events, 6000)
})

test('saldos de dívida e caixa reconciliam mês a mês em SAC com TR e estresse', () => {
  const s = structuredClone(examples[2])
  s.stress.delay = 2
  s.tr = .19
  s.trMonths = [{ date: '2027-06', rate: .41 }]
  s.mip = .025
  const terms = prepare(s)
  const { rows } = simulate(s, terms)
  let mortgage = s.mortgage
  let bridge = terms.close.principal
  let liquidity = Math.max(0, terms.close.balance)
  for (const r of rows) {
    assert.equal(r.housing, cent(mortgage + r.correction + r.housingInterest - r.housingPaid - r.housingExtra))
    assert.equal(r.bridge, cent(bridge + r.bridgeInterest - r.bridgePaid - r.bridgeExtra))
    assert.equal(cent(r.cash + r.reserve), cent(liquidity + r.reserveYield + r.income + r.events - r.spend -
      r.feesPaid - r.housingPaid - r.housingExtra - r.bridgePaid - r.bridgeExtra))
    assert.ok(r.housing >= 0 && r.bridge >= 0 && r.reserve >= 0)
    mortgage = r.housing
    bridge = r.bridge
    liquidity = cent(r.cash + r.reserve)
  }
})

test('faixa de TR e atrasos usam sorteio reproduzível', () => {
  const s = sample()
  s.term = 24
  s.stress = { ...s.stress, delay: 2, probability: 25, trMin: 0, trMax: .3 }
  const a = monteCarlo(s)
  assert.deepEqual(a, monteCarlo(s))
  assert.ok(a.shortfalls > 0 && a.shortfalls <= 1000)
})

test('backup exige versão e dados completos', () => {
  const s = sample()
  assert.deepEqual(parseBackup(JSON.stringify({ version: 1, scenarios: [s] })), [s])
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, scenarios: [s] })))
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, scenarios: [{ ...s, price: -1 }] })))
})

