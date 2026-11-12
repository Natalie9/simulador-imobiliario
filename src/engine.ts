import { cent, datedMonth, month, payment, type Scenario } from './model.ts'

const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000
const offset = (a: string, b: string) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

export function closing(s: Scenario) {
  const costs = cent(s.costs.reduce((sum, item) => sum + item.amount, 0))
  const down = cent(s.price - s.mortgage)
  const initial = cent(down + costs)
  const deficit = Math.max(0, cent(initial - s.capital))
  const target = Math.max(0, cent(initial + s.reserve - s.capital))
  const rate = s.iof / 100
  const principal = s.iofMode === 'cotado' ? s.quotedPrincipal ?? 0 :
    s.iofMode === 'retido' ? cent(target / (1 - rate)) : target
  const iof = s.iofMode === 'cotado' ? s.quotedIof ?? 0 :
    s.iofMode === 'retido' ? cent(principal - target) : cent(principal * rate)
  const net = s.iofMode === 'cotado' ? s.quotedNet ?? 0 :
    s.iofMode === 'retido' ? target : principal
  const iofCash = s.iofMode === 'à parte' ? iof :
    s.iofMode === 'cotado' ? Math.max(0, cent(iof - (principal - net))) : 0
  const lines = [
    ...s.costs, { label: 'Preço do imóvel', date: s.purchase, amount: s.price },
    { label: 'Liberação imobiliária', date: s.mortgageRelease, amount: -s.mortgage },
    { label: 'Liberação do crédito complementar', date: s.bridgeRelease, amount: -net },
    { label: 'IOF pago à parte', date: s.bridgeRelease, amount: iofCash },
  ].filter(x => x.amount !== 0).sort((a, b) => a.date.localeCompare(b.date))
  let cumulative = 0
  const timeline = [...new Set(lines.map(x => x.date))].map(date => {
    const items = lines.filter(x => x.date === date)
    cumulative = cent(cumulative + items.reduce((sum, item) => sum + item.amount, 0))
    return { date, items, balance: cent(s.capital - cumulative), required: cumulative }
  })
  const balance = cent(s.capital - cumulative)
  const reserve = Math.min(s.reserve, Math.max(0, balance))
  return {
    costs, down, initial, deficit, target, principal, iof, net, iofCash, timeline, balance, reserve,
    ownRequired: Math.max(0, ...timeline.map(x => x.required)),
    peakGap: Math.max(0, ...timeline.map(x => -x.balance)),
    orderRisk: principal > 0 && s.bridgeSigned <= s.signed,
    borrowedShare: net > 0 ? Math.min(1, Math.max(0, cent(reserve - Math.max(0, s.capital - initial - iofCash))) / net) : 0,
  }
}

type Cashflow = { date: string; amount: number }
function datedCet(start: string, net: number, payments: Cashflow[]) {
  const total = payments.reduce((sum, p) => sum + p.amount, 0)
  if (net <= 0 || total <= 0) return null
  const dated = payments.map(p => ({ t: days(start, p.date) / 365, amount: p.amount }))
  const pv = (logRate: number) => dated.reduce((sum, p) => sum + p.amount * Math.exp(-logRate * p.t), -net)
  let lo = -16
  let hi = 16
  if (pv(lo) < 0 || pv(hi) > 0) return null
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (pv(mid) > 0) lo = mid
    else hi = mid
  }
  return Math.expm1((lo + hi) / 2) * 100
}

export function prepare(s: Scenario) {
  const close = closing(s)
  const houseRate = Math.expm1(Math.log1p(s.annual / 100) / 12)
  const bridgeRate = s.bridgeRate / 100
  const bridgeCalculated = cent(payment(close.principal, bridgeRate, s.bridgeTerm))
  const bridgeRegular = close.principal > 0 ? s.bridgeQuote ?? bridgeCalculated : 0
  const overrides = new Map(s.trMonths.map(x => [x.date, x.rate]))
  const trAt = (date: string, fallback = s.tr) => (overrides.get(date) ?? fallback) / 100
  const firstTr = trAt(s.firstPayment.slice(0, 7))
  const fees = (s.dfi ?? 0) + (s.fee ?? 0)
  const charges = (balance: number) => cent(balance * (s.mip ?? 0) / 100 + fees)
  const correctedFirst = cent(s.mortgage + cent(s.mortgage * firstTr))
  const houseCore = (balance: number, monthsLeft: number, interest: number) => s.mode === 'SAC'
    ? cent(balance / monthsLeft + interest) : cent(payment(balance, houseRate, monthsLeft))
  const houseCalculated = s.mortgage > 0
    ? cent(houseCore(correctedFirst, s.term, cent(correctedFirst * houseRate)) + charges(correctedFirst)) : 0
  const quoteDelta = s.housingQuote === null ? 0 : cent(s.housingQuote - houseCalculated)
  const mortgageDue = (balance: number, m: number, tr: number, scale: number) => {
    const correction = cent(balance * tr)
    const updated = cent(balance + correction)
    const interest = cent(updated * houseRate)
    const fee = Math.max(0, cent(charges(updated) + quoteDelta))
    const normal = s.mode === 'SAC' ? cent(scale * s.mortgage / s.term + interest) :
      cent(scale * payment(s.mortgage, houseRate, s.term))
    const requested = Math.max(0, cent(normal + Math.min(0, charges(updated) + quoteDelta)))
    const regular = m === s.term && s.housingQuote === null ? cent(updated + interest) : Math.min(requested, cent(updated + interest))
    return { correction, interest, fee, regular }
  }
  const bridgeDue = (balance: number, m: number, interest: number) =>
    m === s.bridgeTerm && s.bridgeQuote === null ? cent(balance + interest) : Math.min(bridgeRegular, cent(balance + interest))

  const housingFlows: Cashflow[] = []
  let housingBalance = s.mortgage
  let factor = 1
  for (let m = 1; m <= s.term && housingBalance > 0; m++) {
    const date = datedMonth(s.firstPayment, m - 1)
    const tr = trAt(date.slice(0, 7))
    factor *= 1 + tr
    const d = mortgageDue(housingBalance, m, tr, factor)
    housingBalance = cent(housingBalance + d.correction + d.interest - d.regular)
    housingFlows.push({ date, amount: cent(d.regular + d.fee + (m === s.term ? housingBalance : 0)) })
  }
  const bridgeFlows: Cashflow[] = []
  let bridgeBalance = close.principal
  for (let m = 1; m <= s.bridgeTerm && bridgeBalance > 0; m++) {
    const interest = cent(bridgeBalance * bridgeRate)
    const due = bridgeDue(bridgeBalance, m, interest)
    bridgeBalance = cent(bridgeBalance + interest - due)
    bridgeFlows.push({ date: datedMonth(s.bridgeFirst, m - 1), amount: cent(due + (m === s.bridgeTerm ? bridgeBalance : 0)) })
  }
  const assessment = s.costs.filter(c => /avaliação/i.test(c.label))
  const mortgageCet = datedCet(s.mortgageRelease, s.mortgage, [...assessment, ...housingFlows])
  const bridgeCet = datedCet(s.bridgeRelease, close.net - close.iofCash, bridgeFlows)
  const bridgePriority = (s.bridgeCet ?? bridgeCet ?? Math.expm1(12 * Math.log1p(bridgeRate)) * 100) >= (s.mortgageCet ?? mortgageCet ?? s.annual)
  return {
    close, bridgeCalculated, bridgeRegular, houseCalculated, quoteDelta, mortgageDue, bridgeDue, houseRate,
    bridgeRate, trAt, mortgageCet, bridgeCet, bridgePriority,
    firstHouse: cent((housingFlows[0]?.amount ?? 0) - (housingFlows.length === s.term && s.term === 1 ? housingBalance : 0)),
    housingResidual: housingBalance, bridgeResidual: bridgeBalance,
  }
}

export interface Row {
  month: string
  income: number
  spendDue: number
  spend: number
  events: number
  housingInterest: number
  correction: number
  fees: number
  feesDue: number
  feesPaid: number
  housingDue: number
  housingPaid: number
  housingExtra: number
  housing: number
  bridgeInterest: number
  bridgeDue: number
  bridgePaid: number
  bridgeExtra: number
  bridge: number
  reserve: number
  reserveYield: number
  cash: number
  shortfall: number
  expenseArrears: number
  feeArrears: number
  surplus: number
}

export function simulate(s: Scenario, prepared = prepare(s), delay = s.stress.delay, fallbackTr = s.tr, summaryOnly = false) {
  const p = prepared
  const start = [s.firstPayment, s.bridgeFirst].sort()[0]
  const firstMonth = start.slice(0, 7)
  const housingStart = offset(firstMonth, s.firstPayment)
  const bridgeStart = offset(firstMonth, s.bridgeFirst)
  const stressStart = offset(firstMonth, s.stress.start)
  const recoveryMonth = s.stress.recoveryMonth ? offset(firstMonth, s.stress.recoveryMonth) : stressStart + delay
  const eventsByMonth = new Map<string, { debt: number; cash: number }>()
  for (const e of s.events) {
    const key = e.date.slice(0, 7)
    const group = eventsByMonth.get(key) ?? { debt: 0, cash: 0 }
    if (e.destination === 'dívida') group.debt += e.amount
    else group.cash += e.amount
    eventsByMonth.set(key, group)
  }
  const horizon = Math.max(housingStart + s.term, bridgeStart + s.bridgeTerm,
    delay > 0 ? Math.max(stressStart + delay, s.stress.recovery ? recoveryMonth + 1 : 0) : 0,
    ...s.events.map(e => offset(firstMonth, e.date) + 1))
  let housing = s.mortgage
  let bridge = p.close.principal
  let reserve = p.close.reserve
  let cash = Math.max(0, cent(p.close.balance - reserve))
  let housingPaidOff: string | null = null
  let bridgePaidOff: string | null = null
  let bridgeMonth = 0
  let bridgeInterestTotal = 0
  let housingInterestTotal = 0
  let interestFactor = 1
  let earned = 0
  let reserveYieldToPayoff = 0
  let feeArrears = 0
  let expenseArrears = 0
  let housingArrears = 0
  let bridgeArrears = 0
  let peakHousing = 0
  let peakGap = 0
  let minCash = cent(cash + reserve)
  let firstShortfall: string | null = null
  let firstWithdrawal: string | null = null
  let firstExhausted: string | null = null
  let totalPaid = 0
  let firstSurplus = 0
  let bridgeResidual = 0
  let housingResidual = 0
  const rows: Row[] = []
  for (let k = 0; k < horizon; k++) {
    const date = month(start, k)
    const h = k - housingStart + 1
    const b = k - bridgeStart + 1
    const oldBridge = bridge
    const oldHousing = housing
    const housingActive = oldHousing > 0 && h > 0
    const bridgeActive = oldBridge > 0 && b > 0
    const tr = p.trAt(date, fallbackTr)
    if (housingActive) interestFactor *= 1 + tr
    const hd = housingActive ? p.mortgageDue(housing, h, tr, interestFactor) : { correction: 0, interest: 0, fee: 0, regular: 0 }
    housing = cent(housing + hd.correction + hd.interest)
    const bridgeInterest = bridgeActive ? cent(bridge * p.bridgeRate) : 0
    bridge = cent(bridge + bridgeInterest)
    const housingDue = h > s.term ? housing : Math.min(housing, cent(hd.regular + housingArrears))
    const bridgeScheduled = bridgeActive ? p.bridgeDue(oldBridge, b, bridgeInterest) : 0
    const bridgeDue = b > s.bridgeTerm ? bridge : Math.min(bridge, cent(bridgeScheduled + bridgeArrears))
    const delayed = delay > 0 && k >= stressStart && k < stressStart + delay
    const recovered = delay > 0 && k === recoveryMonth && s.stress.recovery
    const income = cent(s.income - (delayed ? s.grant : 0) + (recovered ? s.grant * delay : 0))
    const event = eventsByMonth.get(date)
    const reserveYield = cent(reserve * s.cdi / 100)
    reserve = cent(reserve + reserveYield)
    earned = cent(earned + reserveYield)
    const expenses = cent(s.spend + expenseArrears)
    const fees = cent(hd.fee + feeArrears)
    const required = cent(expenses + fees + housingDue + bridgeDue)
    const regularIncome = cent(income + (event?.cash ?? 0))
    const surplus = cent(regularIncome - required)
    if (k === 0) firstSurplus = surplus
    let available = cent(cash + regularIncome)
    cash = 0
    // Keep event money earmarked for debt after covering the month's unpaid bills.
    let debtEvent = cent(event?.debt ?? 0)
    const eventForBills = Math.min(debtEvent, Math.max(0, cent(required - available)))
    debtEvent = cent(debtEvent - eventForBills)
    available = cent(available + eventForBills)
    const withdrawal = Math.min(reserve, Math.max(0, cent(required - available)))
    if (withdrawal > 0) firstWithdrawal ??= date
    reserve = cent(reserve - withdrawal)
    if (withdrawal > 0 && reserve === 0) firstExhausted ??= date
    available = cent(available + withdrawal)
    const take = (amount: number) => {
      const paid = Math.min(available, amount)
      available = cent(available - paid)
      return paid
    }
    const spend = take(expenses)
    expenseArrears = cent(expenses - spend)
    const feesPaid = take(fees)
    feeArrears = cent(fees - feesPaid)
    const housingPaid = take(housingDue)
    const bridgePaid = take(bridgeDue)
    housingArrears = cent(housingDue - housingPaid)
    bridgeArrears = cent(bridgeDue - bridgePaid)
    housing = cent(housing - housingPaid)
    bridge = cent(bridge - bridgePaid)
    const shortfall = cent(required - spend - feesPaid - housingPaid - bridgePaid)
    if (shortfall > 0) firstShortfall ??= date
    peakGap = Math.max(peakGap, shortfall)
    let housingExtra = 0
    let bridgeExtra = 0
    if (oldBridge > 0 && b > 0) bridgeExtra = take(bridge)
    else if (oldBridge === 0 && h > 0) housingExtra = take(housing)
    housing = cent(housing - housingExtra)
    bridge = cent(bridge - bridgeExtra)
    const applyEvent = (debt: 'bridge' | 'housing') => {
      if ((debt === 'bridge' && b <= 0) || (debt === 'housing' && h <= 0)) return
      const paid = Math.min(debtEvent, debt === 'bridge' ? bridge : housing)
      debtEvent = cent(debtEvent - paid)
      if (debt === 'bridge') {
        bridge = cent(bridge - paid)
        bridgeExtra = cent(bridgeExtra + paid)
      } else {
        housing = cent(housing - paid)
        housingExtra = cent(housingExtra + paid)
      }
    }
    applyEvent(p.bridgePriority ? 'bridge' : 'housing')
    applyEvent(p.bridgePriority ? 'housing' : 'bridge')
    cash = cent(available + debtEvent)
    minCash = Math.min(minCash, cent(cash + reserve))
    if (oldBridge > 0) {
      reserveYieldToPayoff = p.close.reserve > 0 ? cent(earned * p.close.borrowedShare * p.close.net / p.close.reserve) : 0
      if (bridge === 0) {
        bridgePaidOff = date
        bridgeMonth = b
      }
    }
    if (oldHousing > 0 && housing === 0) housingPaidOff = date
    if (h === s.term) housingResidual = housing
    if (b === s.bridgeTerm) bridgeResidual = bridge
    bridgeInterestTotal = cent(bridgeInterestTotal + bridgeInterest)
    housingInterestTotal = cent(housingInterestTotal + hd.interest)
    totalPaid = cent(totalPaid + feesPaid + housingPaid + housingExtra + bridgePaid + bridgeExtra)
    peakHousing = Math.max(peakHousing, cent(hd.regular + hd.fee))
    if (!summaryOnly) rows.push({ month: date, income, spendDue: expenses, spend, events: cent((event?.cash ?? 0) + (event?.debt ?? 0)),
      housingInterest: hd.interest, correction: hd.correction, fees: hd.fee, feesDue: fees, feesPaid, housingDue, housingPaid, housingExtra, housing,
      bridgeInterest, bridgeDue, bridgePaid, bridgeExtra, bridge, reserve, reserveYield, cash, shortfall, surplus, expenseArrears, feeArrears })
  }
  const reserveInterest = cent(bridgeInterestTotal * p.close.borrowedShare)
  const reserveIof = cent(p.close.iof * p.close.borrowedShare)
  const reserveCost = p.close.borrowedShare > 0 ? cent(reserveInterest + reserveIof - reserveYieldToPayoff) : 0
  return { rows, firstSurplus, bridgePaidOff, bridgeMonth, housingPaidOff, minCash, peakGap, firstShortfall, firstWithdrawal, firstExhausted,
    totalPaid, bridgeInterestTotal, housingInterestTotal, reserveInterest, reserveIof, reserveCost, reserveYieldToPayoff, earned,
    peakHousing, bridgeResidual, housingResidual, finalBridge: bridge, finalHousing: housing, feeArrears, expenseArrears }
}

export function noReserve(s: Scenario): Scenario | null {
  const full = closing(s)
  const needed = full.deficit
  if (s.iofMode === 'cotado' && full.net === 0 && needed > 0) return null
  const ratio = full.net > 0 ? needed / full.net : 0
  const scaled = (n: number | null) => n === null ? null : cent(n * ratio)
  return {
    ...s, reserve: 0, bridgeQuote: scaled(s.bridgeQuote),
    quotedPrincipal: scaled(s.quotedPrincipal), quotedNet: scaled(s.quotedNet), quotedIof: scaled(s.quotedIof),
  }
}

export function monteCarlo(s: Scenario) {
  let seed = s.stress.seed >>> 0
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  let shortfalls = 0
  let exhaustion = 0
  const base = prepare(s)
  for (let i = 0; i < 1000; i++) {
    const delay = random() < s.stress.probability / 100 ? s.stress.delay || 1 : 0
    const { trMin, trMax } = s.stress
    const tr = trMin !== null && trMax !== null ? trMin + random() * (trMax - trMin) : s.tr
    const result = simulate(s, base, delay, tr, true)
    if (result.firstShortfall || base.close.peakGap > 0) shortfalls++
    if (result.firstExhausted) exhaustion++
  }
  return { shortfalls, exhaustion }
}

