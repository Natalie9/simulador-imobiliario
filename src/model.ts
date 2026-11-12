export const cent = (n: number) => (Math.round((n + Number.EPSILON) * 100) + 0) / 100
export const month = (date: string, offset: number) => {
  const [year, m] = date.split('-').map(Number)
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7)
}
export const datedMonth = (date: string, offset: number) => {
  const target = month(date, offset)
  const [year, m] = target.split('-').map(Number)
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return target + '-' + String(Math.min(Number(date.slice(8)), last)).padStart(2, '0')
}

export interface Scenario {
  id: string
  name: string
  price: number
  mortgage: number
  capital: number
  costs: { label: string; date: string; amount: number }[]
  signed: string
  purchase: string
  mortgageRelease: string
  bridgeSigned: string
  bridgeRelease: string
  firstPayment: string
  bridgeFirst: string
  verified: number
  cap: number
  income: number
  grant: number
  spend: number
  reserve: number
  cdi: number
  annual: number
  term: number
  mode: 'Price' | 'SAC'
  tr: number
  trMonths: { date: string; rate: number }[]
  mip: number | null
  dfi: number | null
  fee: number | null
  housingQuote: number | null
  mortgageCet: number | null
  bridgeRate: number
  bridgeTerm: number
  iof: number
  iofMode: 'retido' | 'à parte' | 'cotado'
  quotedPrincipal: number | null
  quotedNet: number | null
  quotedIof: number | null
  bridgeQuote: number | null
  bridgeCet: number | null
  events: { label: string; date: string; amount: number; destination: 'dívida' | 'caixa' }[]
  stress: { start: string; delay: 0 | 1 | 2; recovery: boolean; recoveryMonth: string | null; probability: number; seed: number; trMin: number | null; trMax: number | null }
}

const base: Scenario = {
  id: 'demo-price', name: 'Exemplo · Price fixa', price: 360000, mortgage: 288000, capital: 66000,
  costs: [
    { label: 'Avaliação bancária', date: '2027-05-05', amount: 1200 },
    { label: 'ITBI', date: '2027-05-10', amount: 7200 },
    { label: 'Registro e certidões', date: '2027-05-10', amount: 2200 },
    { label: 'Adaptação e mudança', date: '2027-05-12', amount: 4000 },
  ],
  signed: '2027-05-05', purchase: '2027-05-10', mortgageRelease: '2027-05-10',
  bridgeSigned: '2027-05-10', bridgeRelease: '2027-05-10',
  firstPayment: '2027-06-10', bridgeFirst: '2027-06-10',
  verified: 11000, cap: 30, income: 12500, grant: 10000, spend: 6400, reserve: 9500, cdi: .7,
  annual: 11.5, term: 360, mode: 'Price', tr: 0, trMonths: [], mip: null, dfi: null, fee: null,
  housingQuote: 3300, mortgageCet: null,
  bridgeRate: 1.6, bridgeTerm: 36, iof: 3.2, iofMode: 'retido',
  quotedPrincipal: null, quotedNet: null, quotedIof: null, bridgeQuote: null, bridgeCet: null,
  events: [{ label: 'Entrada extra de exemplo', date: '2029-01-10', amount: 6000, destination: 'dívida' }],
  stress: { start: '2027-07', delay: 0, recovery: true, recoveryMonth: null, probability: 0, seed: 42, trMin: null, trMax: null },
}

export const examples: Scenario[] = [
  base,
  { ...structuredClone(base), id: 'demo-sac', name: 'Exemplo · SAC fixa', mode: 'SAC', housingQuote: 3650 },
  {
    ...structuredClone(base), id: 'demo-sac-tr', name: 'Exemplo · SAC + TR', mode: 'SAC', annual: 10.25, tr: .1,
    housingQuote: null, costs: base.costs.map((item, i) => i === 0 ? { ...item, amount: 800 } : { ...item }),
  },
]

export const payment = (principal: number, rate: number, term: number) =>
  rate === 0 ? principal / term : principal * rate / -Math.expm1(-term * Math.log1p(rate))

export const dateValid = (s: unknown): s is string =>
  typeof s === 'string' && /^(19\d\d|20\d\d|21\d\d|22\d\d)-\d\d-\d\d$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s

export function validation(s: Scenario) {
  const errors: string[] = []
  if (!s.name.trim()) errors.push('Informe o nome do cenário.')
  if (s.mortgage > s.price) errors.push('O financiamento supera o preço do imóvel.')
  if (s.grant > s.income) errors.push('A bolsa supera a renda familiar.')
  if (s.mortgageRelease < s.signed || s.bridgeRelease < s.bridgeSigned)
    errors.push('A liberação de cada crédito deve ocorrer a partir da respectiva assinatura.')
  if (s.firstPayment <= s.mortgageRelease || s.bridgeFirst <= s.bridgeRelease)
    errors.push('A primeira parcela de cada crédito deve ocorrer depois de sua liberação.')
  const start = [s.firstPayment, s.bridgeFirst].sort()[0].slice(0, 7)
  const end = month(start, 599)
  if ([s.firstPayment, s.bridgeFirst].some(date => date.slice(0, 7) > end))
    errors.push('As primeiras parcelas devem estar dentro de 600 meses do início da projeção.')
  if (s.events.some(e => e.date.slice(0, 7) < start || e.date.slice(0, 7) > end))
    errors.push('Cadastre as entradas pontuais nos primeiros 600 meses da projeção.')
  if ((s.stress.delay || s.stress.probability) && (s.stress.start < start || s.stress.start > end))
    errors.push('O atraso deve começar nos primeiros 600 meses da projeção.')
  if ((s.stress.delay || s.stress.probability) && s.stress.recovery && s.stress.recoveryMonth &&
      (s.stress.recoveryMonth < month(s.stress.start, s.stress.delay || 1) || s.stress.recoveryMonth > end))
    errors.push('A reposição das bolsas deve ocorrer após o último mês afetado e dentro da projeção.')
  if (s.iofMode === 'cotado' && [s.quotedPrincipal, s.quotedNet, s.quotedIof, s.bridgeQuote].some(v => v === null))
    errors.push('Preencha os quatro valores da cotação do crédito complementar.')
  if ((s.quotedNet ?? 0) > (s.quotedPrincipal ?? 0) && s.iofMode === 'cotado')
    errors.push('O líquido cotado supera o principal.')
  if ((s.stress.trMin === null) !== (s.stress.trMax === null) ||
      (s.stress.trMin !== null && s.stress.trMax !== null && s.stress.trMin > s.stress.trMax))
    errors.push('Informe os dois limites da faixa de TR em ordem crescente ou deixe ambos em branco.')
  if (new Set(s.trMonths.map(x => x.date)).size !== s.trMonths.length)
    errors.push('Use apenas uma taxa de TR por mês.')
  return errors
}

