import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const url = 'http://127.0.0.1:4173/'
const mime = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8' }
const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url
  if (req.method !== 'GET' || !/^\/(index\.html|assets\/[\w.-]+\.(css|js))$/.test(path ?? '')) {
    res.writeHead(404).end()
    return
  }
  try {
    const body = await readFile(new URL('./dist' + path, import.meta.url))
    res.writeHead(200, {
      'Content-Type': mime[path.split('.').at(-1)],
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    }).end(body)
  } catch {
    res.writeHead(404).end('Arquivo ausente. Verifique a pasta dist.')
  }
})
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'A porta 4173 já está em uso. Confira se o simulador já está aberto.' : error.message)
  process.exitCode = 1
})
server.listen(4173, '127.0.0.1', () => {
  console.log('Simulador disponível em ' + url + '  |  Ctrl+C para encerrar')
  if (process.platform === 'win32' && process.argv.includes('--open'))
    spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' }).unref()
})

