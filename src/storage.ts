import { z } from 'zod'
import { dateValid, type Scenario } from './model.ts'

const number = z.number().finite().min(0).max(1e9)
const rate = number.max(100)
const tr = number.max(5)
const date = z.string().refine(dateValid)
const month = z.string().refine(value => /^\d{4}-\d{2}$/.test(value) && dateValid(value + '-01'))
const label = z.string().trim().min(1).max(120)

const schema = z.strictObject({
  id: label, name: label, price: number, mortgage: number, capital: number,
  costs: z.array(z.strictObject({ label, date, amount: number })).max(100),
  signed: date, purchase: date, mortgageRelease: date, bridgeSigned: date, bridgeRelease: date,
  firstPayment: date, bridgeFirst: date,
  verified: number, cap: rate, income: number, grant: number, spend: number, reserve: number, cdi: rate,
  annual: rate, term: z.number().int().min(1).max(600), mode: z.enum(['Price', 'SAC']), tr,
  trMonths: z.array(z.strictObject({ date: month, rate: tr })).max(600),
  mip: rate.nullable(), dfi: number.nullable(), fee: number.nullable(),
  housingQuote: number.nullable(), mortgageCet: number.nullable(),
  bridgeRate: rate, bridgeTerm: z.number().int().min(1).max(600), iof: number.max(99),
  iofMode: z.enum(['retido', 'à parte', 'cotado']),
  quotedPrincipal: number.nullable(), quotedNet: number.nullable(), quotedIof: number.nullable(),
  bridgeQuote: number.nullable(), bridgeCet: number.nullable(),
  events: z.array(z.strictObject({ label, date, amount: number, destination: z.enum(['dívida', 'caixa']) })).max(100),
  stress: z.strictObject({
    start: month, delay: z.union([z.literal(0), z.literal(1), z.literal(2)]), recovery: z.boolean(), recoveryMonth: month.nullable(),
    probability: rate, seed: z.number().int().min(0).max(4294967295), trMin: tr.nullable(), trMax: tr.nullable(),
  }),
})

export function shapeErrors(s: Scenario) {
  const parsed = schema.safeParse(s)
  return parsed.success ? [] : parsed.error.issues.map(issue => `Valor inválido em ${issue.path.join('.') || 'cenário'}.`)
}

const backupSchema = z.strictObject({ version: z.literal(1), scenarios: z.array(schema).min(1).max(1000) })
export function parseBackup(raw: string): Scenario[] {
  const parsed = backupSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new Error('O arquivo não corresponde ao formato de backup versão 1.')
  return parsed.data.scenarios
}

let pending: Promise<IDBDatabase> | undefined
function openDb() {
  pending ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('simulador-imobiliario', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scenarios', { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return pending
}

export async function readScenarios(): Promise<Scenario[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction('scenarios').objectStore('scenarios').getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveScenarios(items: Scenario[]) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('scenarios', 'readwrite')
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    const store = transaction.objectStore('scenarios')
    for (const item of items) store.put(item)
  })
}

export function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

