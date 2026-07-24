# Sistema Cold Email — Pindo

Sistema de prospeccao para a Pindo: busca empresas que ainda nao tem site,
tenta descobrir o email de contato, gera e publica um site-modelo de
demonstracao para cada lead, e monta um cold email oferecendo os servicos
da Pindo (criacao de site + cold email como servico).

## Fontes de busca

Duas opcoes, escolhidas com `--source`:

- **`osm` (padrao)** — usa dados abertos do OpenStreetMap (Overpass API +
  Nominatim para geocodificar a cidade). Gratis, sem chave de API, e' uma
  API de verdade feita para ser consultada (nao e' scraping), e funciona
  em qualquer ambiente com HTTPS normal — inclusive em execucoes
  automatizadas/hospedadas. Cobertura no Brasil e' geralmente menor que a
  do Google Maps. O termo de busca (`--query`) precisa ser uma
  especialidade mapeada em `src/scraper/healthSpecialties.ts` (dentista,
  dermatologista, fisioterapeuta, psicologo, nutricionista, cardiologista,
  ginecologista, pediatra, ortopedista, oftalmologista, psiquiatra,
  "clinica geral", veterinario — adicione mais se precisar).
- **`maps`** — abre o Google Maps de verdade via automacao de navegador
  (Playwright). Cobertura melhor, mas so funciona com rede irrestrita (o
  navegador nao passa por proxies HTTP/HTTPS restritivos) e viola os
  Termos de Servico do Google — use com moderacao, fora de ambientes com
  proxy/firewall na frente do navegador.

## Pipeline

```
search  -> enrich -> (import-emails, se precisar) -> sites -> compose -> send
```

1. **search** — busca estabelecimentos (OSM ou Maps) e salva no "banco"
   local (`data/leads.json`). Quando a fonte ja traz um email junto (ex:
   tag `email`/`contact:email` do OSM), o lead ja nasce como
   `email_ready`. O restante, sem site, vira `no_website`.
2. **enrich** — para cada lead `no_website` sem email ainda, tenta achar o
   CNPJ pelo nome + cidade (via navegador, ver `CNPJ_NAME_SEARCH_ENABLED`
   abaixo) e consulta bases publicas de CNPJ (BrasilAPI/ReceitaWS) para
   pegar email, telefone, atividade (CNAE) e situacao cadastral.
   - Quem tem email vai para `email_ready`.
   - Quem nao tem email (ou quando a busca por nome esta desativada) vai
     para `needs_manual_email` e e' exportado em
     `data/exports/precisa_email_manual.csv` para preenchimento manual
     (ou enriquecimento externo, ex: Hunter.io).
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
node dist/cli.js run --source osm --query dentista --location "São Paulo, SP" --max 20
node dist/cli.js send   # depois de revisar os emails compostos
```

Ou em modo dev (sem build):

```bash
npm run dev -- search --source osm --query dentista --location "São Paulo, SP"
npm run dev -- enrich
npm run dev -- sites
npm run dev -- compose
npm run dev -- send
npm run dev -- status
```

## Configuracao

Copie `.env.example` para `.env` e preencha:

- `MAPS_QUERY` / `MAPS_LOCATION` / `MAPS_MAX_RESULTS` — busca padrao.
- `CNPJ_NAME_SEARCH_ENABLED` — deixe `false` em ambientes sem navegador
  com rede irrestrita (ex: sessoes hospedadas atras de proxy). Os leads
  sem email vao direto pra planilha manual, sem tentar (e travar) a busca
  via navegador.
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
- **`data/leads.json` e' versionado no git de proposito** (veja o
  `.gitignore`), para o estado do funil sobreviver entre execucoes
  automatizadas em sessoes/containers efemeros. Isso significa que nomes,
  telefones e emails de empresas prospectadas ficam no historico do
  repositorio — ok para dado B2B de estabelecimentos, mas vale saber
  antes de automatizar.

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
