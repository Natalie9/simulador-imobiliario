# Simulador imobiliário na Vercel

Esta edição inclui a aba **Gastos mensais** e três cenários fictícios editáveis.

## Publicar pelo GitHub

1. Extraia o ZIP e coloque os arquivos extraídos na raiz de um novo repositório GitHub. Inclua `.gitignore`, `package-lock.json` e `vercel.json`.
2. Na Vercel, abra **Add New → Project** e importe o repositório. A raiz do projeto deve conter o `package.json`.
3. Confira o preset **Vite** e o Node.js **24.x**. O arquivo `vercel.json` configura a instalação com `npm ci`, o build com `npm run build` e a pasta de saída `dist`.
4. Clique em **Deploy** e abra a URL gerada. As alterações na branch de produção geram novos deploys.

Para restringir o acesso ao link, configure **Settings → Deployment Protection → All Deployments** com **Vercel Authentication**. [Documentação da Vercel](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)

## Transferir cenários

Exporte o backup JSON na versão local e importe pelo botão de restauração no site publicado. Guarde o backup fora do repositório. Cada navegador mantém sua própria cópia dos cenários.

## Testar localmente

Com Node.js 24, execute `npm ci`, `npm test` e `npm run build`. Rode `npm start` e abra `http://127.0.0.1:4173/`.
