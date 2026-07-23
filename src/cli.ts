#!/usr/bin/env node
import { Command } from "commander";
import { config } from "./config.js";
import { leadStore } from "./db/store.js";
import { logger } from "./utils/logger.js";
import { scrapeGoogleMaps } from "./scraper/googleMaps.js";
import { enrichAllPending } from "./enrichment/enrich.js";
import { exportLeadsNeedingEmail, importManualEmails } from "./enrichment/csvFallback.js";
import { publishSitesForReadyLeads } from "./site/publishSite.js";
import { composeAllReadySites } from "./email/composeEmail.js";
import { sendReadyEmails } from "./email/mailer.js";
import { unsubscribeEmail } from "./email/unsubscribe.js";
import type { LeadStatus } from "./types.js";

const program = new Command();
program
  .name("pindo-cold-email")
  .description("Prospeccao de empresas sem site no Google Maps + cold email da Pindo");

program
  .command("search")
  .description("Busca empresas no Google Maps e salva as que nao tem site")
  .option("-q, --query <query>", "termo de busca (ex: 'salao de beleza')", config.maps.defaultQuery)
  .option("-l, --location <location>", "cidade/regiao (ex: 'Porto Alegre, RS')", config.maps.defaultLocation)
  .option("-n, --max <n>", "numero maximo de resultados", String(config.maps.maxResults))
  .option("--headed", "abre o navegador visivel (util para depurar)", false)
  .action(async (opts) => {
    await leadStore.load();
    const listings = await scrapeGoogleMaps({
      query: opts.query,
      location: opts.location,
      maxResults: parseInt(opts.max, 10),
      headless: !opts.headed,
    });

    const [city, state] = String(opts.location).split(",").map((s: string) => s.trim());
    let semSite = 0;
    for (const listing of listings) {
      const lead = leadStore.upsertFromMaps(listing, city ?? opts.location, state ?? "");
      if (lead.status === "no_website") semSite++;
    }
    await leadStore.save();
    logger.info(`Total coletado: ${listings.length}. Sem site (leads potenciais): ${semSite}.`);
  });

program
  .command("enrich")
  .description("Tenta achar CNPJ + email dos leads sem site")
  .action(async () => {
    await leadStore.load();
    const result = await enrichAllPending();
    logger.info(
      `Enriquecimento concluido: ${result.ready} com email, ${result.needsManual} precisam de email manual, ${result.notFound} sem CNPJ encontrado.`
    );

    const needManual = leadStore.byStatus("needs_manual_email");
    if (needManual.length > 0) {
      const file = await exportLeadsNeedingEmail(needManual);
      logger.info(
        `Planilha exportada com ${needManual.length} lead(s) sem email automatico: ${file}`
      );
    }
  });

program
  .command("import-emails")
  .description("Importa emails preenchidos manualmente na planilha exportada pelo comando 'enrich'")
  .option("-f, --file <path>", "caminho do CSV preenchido")
  .action(async (opts) => {
    await leadStore.load();
    const entries = await importManualEmails(opts.file);
    let updated = 0;
    for (const entry of entries) {
      const lead = leadStore.get(entry.id);
      if (!lead) continue;
      leadStore.update(entry.id, {
        email: entry.email,
        emailSource: "manual_csv",
        status: "email_ready",
      });
      updated++;
    }
    await leadStore.save();
    logger.info(`${updated} lead(s) atualizados com email manual.`);
  });

program
  .command("sites")
  .description("Gera (e publica na Vercel, se configurado) o site-modelo para os leads com email pronto")
  .action(async () => {
    await leadStore.load();
    const result = await publishSitesForReadyLeads();
    logger.info(`Sites: ${result.ok} gerados/publicados, ${result.failed} falharam.`);
  });

program
  .command("compose")
  .description("Monta o texto do email (assunto + corpo) para os leads com site pronto")
  .action(async () => {
    await leadStore.load();
    const result = composeAllReadySites();
    await leadStore.save();
    logger.info(`${result.composed} email(s) compostos.`);
  });

program
  .command("send")
  .description("Envia os emails compostos via SMTP (respeita limite por execucao e intervalo entre envios)")
  .action(async () => {
    await leadStore.load();
    const result = await sendReadyEmails();
    logger.info(`Envio concluido: ${result.sent} enviados, ${result.skipped} pulados, ${result.failed} falharam.`);
  });

program
  .command("run")
  .description("Roda o pipeline completo ate compor os emails (busca -> enriquece -> gera sites -> compoe). NAO envia automaticamente — use 'send' depois de revisar.")
  .option("-q, --query <query>", "termo de busca", config.maps.defaultQuery)
  .option("-l, --location <location>", "cidade/regiao", config.maps.defaultLocation)
  .option("-n, --max <n>", "numero maximo de resultados", String(config.maps.maxResults))
  .action(async (opts) => {
    await leadStore.load();

    const listings = await scrapeGoogleMaps({
      query: opts.query,
      location: opts.location,
      maxResults: parseInt(opts.max, 10),
    });
    const [city, state] = String(opts.location).split(",").map((s: string) => s.trim());
    for (const listing of listings) {
      leadStore.upsertFromMaps(listing, city ?? opts.location, state ?? "");
    }
    await leadStore.save();

    const enrichResult = await enrichAllPending();
    logger.info(
      `Enriquecimento: ${enrichResult.ready} com email, ${enrichResult.needsManual} precisam de email manual, ${enrichResult.notFound} sem CNPJ.`
    );

    const needManual = leadStore.byStatus("needs_manual_email");
    if (needManual.length > 0) {
      const file = await exportLeadsNeedingEmail(needManual);
      logger.info(`Planilha de emails manuais: ${file}`);
    }

    const sitesResult = await publishSitesForReadyLeads();
    logger.info(`Sites: ${sitesResult.ok} gerados/publicados, ${sitesResult.failed} falharam.`);

    const composeResult = composeAllReadySites();
    await leadStore.save();
    logger.info(`${composeResult.composed} email(s) prontos para revisao. Rode "send" quando quiser disparar.`);
  });

program
  .command("status")
  .description("Mostra quantos leads existem em cada etapa do funil")
  .action(async () => {
    await leadStore.load();
    const all = leadStore.all();
    const counts = new Map<LeadStatus, number>();
    for (const lead of all) counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
    logger.info(`Total de leads: ${all.length}`);
    for (const [status, count] of counts.entries()) {
      console.log(`  ${status.padEnd(22)} ${count}`);
    }
  });

program
  .command("unsubscribe <email>")
  .description("Marca um email como descadastrado (pare de contatar)")
  .action(async (email: string) => {
    await unsubscribeEmail(email);
  });

await program.parseAsync(process.argv);
