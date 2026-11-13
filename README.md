# Simulador imobiliário

Uma tela só: preencha o imóvel, o financiamento, o empréstimo para completar a entrada, o orçamento da família e o FGTS. O resultado mostra a sobra mensal, as parcelas, quando cada dívida é quitada e quanto custa manter a reserva.

O último preenchimento fica salvo no navegador. O botão **Voltar ao exemplo** restaura os valores fictícios.

## O que o cálculo considera

- O empréstimo cobre o que falta para a compra mais a reserva, com o IOF embutido.
- Toda sobra do mês quita o empréstimo. Depois, a sobra e a parcela liberada vão para o financiamento.
- O FGTS abate primeiro a dívida mais cara.
- Não entram TR, seguros (MIP/DFI) e tarifas. Use a proposta do banco para conferir a parcela.

O motor completo (`src/engine.ts`) ainda suporta datas, TR, encargos, IOF cotado e teste de estresse. A tela simples (`src/simple.ts`) preenche esses campos com valores fixos.

## Publicar na Vercel

Importe o repositório em **Add New → Project**, confira o preset **Vite** e o Node.js **24.x** e clique em **Deploy**. O `vercel.json` já configura `npm ci`, `npm run build` e a pasta `dist`.

## Testar localmente

Com Node.js 24, execute `npm ci`, `npm test` e `npm run build`. Rode `npm start` e abra `http://127.0.0.1:4173/`.
