import { prepare, simulate } from './engine.ts'
import { datedMonth, examples, validation, type Scenario } from './model.ts'

// Campos da tela simplificada. Todo o resto do modelo completo recebe um valor fixo em toScenario.
export interface Inputs {
  price: number
  mortgage: number
  capital: number
  costs: number
  mode: 'Price' | 'SAC'
  annual: number
  term: number
  bridgeRate: number
  bridgeTerm: number
  iof: number
  income: number
  spend: number
  reserve: number
  cdi: number
  fgts: number
  fgtsMonth: number
}

export const defaults: Inputs = {
  price: 360000, mortgage: 288000, capital: 66000, costs: 14600,
  mode: 'Price', annual: 11.5, term: 360,
  bridgeRate: 1.6, bridgeTerm: 36, iof: 3.2,
  income: 12500, spend: 6400, reserve: 9500, cdi: .7,
  fgts: 6000, fgtsMonth: 20,
}

// As datas só servem para ordenar o fluxo: compra e liberações no mesmo dia, primeiras parcelas no mês seguinte.
const START = '2027-05-10'
const FIRST = datedMonth(START, 1)

export function toScenario(i: Inputs): Scenario {
  return {
    ...structuredClone(examples[0]),
    id: 'simples', name: 'Simulação',
    price: i.price, mortgage: i.mortgage, capital: i.capital,
    costs: i.costs > 0 ? [{ label: 'Despesas da compra', date: START, amount: i.costs }] : [],
    signed: START, purchase: START, mortgageRelease: START, bridgeSigned: START, bridgeRelease: START,
    firstPayment: FIRST, bridgeFirst: FIRST,
    verified: i.income, cap: 100, income: i.income, grant: 0, spend: i.spend, reserve: i.reserve, cdi: i.cdi,
    annual: i.annual, term: i.term, mode: i.mode, tr: 0, trMonths: [],
    mip: null, dfi: null, fee: null, housingQuote: null, mortgageCet: null,
    bridgeRate: i.bridgeRate, bridgeTerm: i.bridgeTerm, iof: i.iof, iofMode: 'retido',
    quotedPrincipal: null, quotedNet: null, quotedIof: null, bridgeQuote: null, bridgeCet: null,
    events: i.fgts > 0 ? [{ label: 'FGTS', date: datedMonth(FIRST, i.fgtsMonth - 1), amount: i.fgts, destination: 'dívida' }] : [],
    stress: { start: FIRST.slice(0, 7), delay: 0, recovery: true, recoveryMonth: null, probability: 0, seed: 42, trMin: null, trMax: null },
  }
}

const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

export function check(i: Inputs) {
  const errors: string[] = []
  const numbers = Object.entries(i).filter(([, v]) => typeof v === 'number') as [keyof Inputs, number][]
  if (numbers.some(([, v]) => !Number.isFinite(v) || v < 0)) errors.push('Preencha todos os campos com valores válidos, sem números negativos.')
  if (i.mortgage > i.price) errors.push('O valor financiado não pode ser maior que o preço do imóvel.')
  if (!whole(i.term, 1, 600)) errors.push('O prazo do financiamento deve ser um número inteiro de 1 a 600 meses.')
  if (!whole(i.bridgeTerm, 1, 600)) errors.push('O prazo do empréstimo deve ser um número inteiro de 1 a 600 meses.')
  if (i.fgts > 0 && !whole(i.fgtsMonth, 1, 600)) errors.push('O mês do FGTS deve ser um número inteiro de 1 a 600.')
  if (i.iof >= 100) errors.push('O IOF deve ser menor que 100%.')
  return errors.length ? errors : validation(toScenario(i))
}

export function calculate(i: Inputs) {
  const s = toScenario(i)
  const terms = prepare(s)
  const run = simulate(s, terms)
  const paidAt = (date: string | null) => date ? run.rows.findIndex(r => r.month === date) + 1 : null
  return { s, terms, run, housingMonth: paidAt(run.housingPaidOff) }
}
