# Sistema Cold Email — Pindo

Sistema de prospeccao para a Pindo: busca empresas no Google Maps que ainda
nao tem site, tenta descobrir o email de contato (via bases de CNPJ),
gera e publica um site-modelo de demonstracao para cada lead, e envia um
cold email oferecendo os servicos da Pindo (criacao de site + cold email
como servico).

## Pipeline

```
search  -> enrich -> (import-emails, se precisar) -> sites -> compose -> send
```

1. **search** — abre o Google Maps (via automacao de navegador/Playwright)
   pesquisando `<termo> em <cidade>`, coleta nome, categoria, endereco,
   telefone, avaliacoes e se ha site cadastrado. Empresas sem site viram
   leads (`status: no_website`).
2. **enrich** — para cada lead sem site, tenta achar o CNPJ pelo nome +
   cidade e consulta bases publicas de CNPJ (BrasilAPI/ReceitaWS) para
   pegar email, telefone, atividade (CNAE) e situacao cadastral.
   - Quem tem email vai para `email_ready`.
   - Quem nao tem email no registro vai para `needs_manual_email` e e'
     exportado em `data/exports/precisa_email_manual.csv` para
     preenchimento manual (ou enriquecimento externo, ex: Hunter.io).
3. **import-emails** — reimporta a planilha depois de preenchida.
4. **sites** — gera um site de uma pagina personalizado para o lead
   (nome, categoria, endereco, telefone/WhatsApp) e publica na Vercel
   (se `VERCEL_TOKEN` estiver configurado). Sem o token, o HTML fica
   salvo localmente em `data/sites/`.
5. **compose** — monta assunto + corpo do email citando o link do site
   gerado e oferecendo os servicos da Pindo.
6. **send** — envia via SMTP, respeitando um limite de envios por
   execucao e um intervalo minimo entre cada envio.

Rode tudo de uma vez (menos o envio) com:

```bash
npm run build
node dist/cli.js run --query "salao de beleza" --location "Porto Alegre, RS" --max 20
node dist/cli.js send   # depois de revisar os emails compostos
```

Ou em modo dev (sem build):

```bash
npm run dev -- search --query "restaurantes" --location "Canoas, RS"
npm run dev -- enrich
npm run dev -- sites
npm run dev -- compose
npm run dev -- send
npm run dev -- status
```

## Configuracao

Copie `.env.example` para `.env` e preencha:

- `MAPS_QUERY` / `MAPS_LOCATION` / `MAPS_MAX_RESULTS` — busca padrao.
- `VERCEL_TOKEN` — token de https://vercel.com/account/tokens, para
  publicar os sites de preview de verdade. Sem ele, os sites so ficam
  salvos localmente (nao gera erro, so nao publica).
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` — conta usada para
  enviar os emails. Com Gmail, use uma "senha de app"
  (https://myaccount.google.com/apppasswords), nunca a senha normal.
- `FROM_EMAIL`, `FROM_NAME`, `REPLY_TO_EMAIL` — identificacao do
  remetente exibida no email.
- `SEND_MAX_PER_RUN` / `SEND_MIN_DELAY_MS` — limites de envio por
  execucao (protegem a conta de email contra bloqueio por volume).

## Avisos importantes (leia antes de usar em producao)

- **Scraping do Google Maps e de resultados do Google (busca de CNPJ)
  viola os Termos de Servico dessas plataformas.** O codigo foi escrito
  para ser comedido (delays entre acoes, poucos resultados por vez), mas
  ainda assim ha risco de bloqueio de IP/CAPTCHA e de os seletores
  quebrarem quando o Google mudar o HTML. Para uso continuo/em escala,
  o caminho mais robusto e' migrar `src/scraper/googleMaps.ts` para a
  [Google Places API](https://developers.google.com/maps/documentation/places/web-service)
  oficial (paga, mas estavel e sem risco de bloqueio).
- **Descoberta de email via CNPJ e' best-effort.** As bases publicas
  gratuitas (BrasilAPI, ReceitaWS) so tem o email quando a propria
  empresa o informou a Receita Federal — muitas vezes esta em branco.
  Empresas muito informais provavelmente cairao no fallback manual
  (planilha CSV).
- **Cold email tem regras (LGPD, boas praticas anti-spam).** O template
  em `src/email/composeEmail.ts` ja inclui identificacao clara do
  remetente e instrucao de opt-out ("responda com REMOVER"). Quando
  alguem pedir para nao receber mais, rode:
  `node dist/cli.js unsubscribe email@da-empresa.com` — isso bloqueia
  envios futuros para aquele endereco. Esse processo hoje e' manual
  (nao ha leitura automatica de respostas ainda).
- Nenhum email e' enviado durante `search`, `enrich`, `sites`, `compose`
  ou `run` — apenas o comando `send` dispara emails de verdade. Revise
  `data/leads.json` (campos `emailSubject`/`emailBody`) antes de rodar
  `send`.

## Estrutura

```
src/
  scraper/googleMaps.ts       busca e extrai listagens do Google Maps
  enrichment/
    cnpjSearch.ts              nome+cidade -> numero de CNPJ (best-effort)
    cnpjLookup.ts              CNPJ -> dados oficiais (email, CNAE, etc)
    csvFallback.ts             export/import da planilha de email manual
    enrich.ts                  orquestra os dois passos acima por lead
  site/
    generateSite.ts            preenche o template HTML com dados do lead
    deployVercel.ts             publica na Vercel via API
    publishSite.ts              orquestra geracao + publicacao
  email/
    composeEmail.ts             gera assunto/corpo do cold email
    mailer.ts                   envia via SMTP com limites de taxa
    unsubscribe.ts               marca email como descadastrado
  db/store.ts                  "banco" em JSON (data/leads.json), com dedup
  cli.ts                       comandos (search/enrich/sites/compose/send/...)
templates/site/index.html      template do site-modelo
data/                          leads.json, exports/, sites/ (gerado em runtime, git-ignorado)
```
