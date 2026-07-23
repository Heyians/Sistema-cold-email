import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { leadStore } from "../db/store.js";
import { logger } from "../utils/logger.js";
import type { Lead } from "../types.js";
import { generateSiteHtml, slugify } from "./generateSite.js";
import { deployStaticSite } from "./deployVercel.js";

const LOCAL_SITES_DIR = path.join(config.paths.dataDir, "sites");

/**
 * Gera o site-modelo para o lead. Se houver VERCEL_TOKEN configurado,
 * publica de verdade e grava a URL live no lead; caso contrario, apenas
 * salva o HTML localmente para inspecao manual.
 */
export async function publishSiteForLead(lead: Lead): Promise<Lead> {
  const html = await generateSiteHtml(lead);
  const slug = slugify(lead.name, lead.id);

  await mkdir(LOCAL_SITES_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_SITES_DIR, `${slug}.html`), html, "utf-8");

  if (!config.vercel.token) {
    logger.warn(
      `VERCEL_TOKEN nao configurado — site de "${lead.name}" gerado apenas localmente em data/sites/${slug}.html`
    );
    return leadStore.update(lead.id, {
      previewSiteSlug: slug,
      previewSiteUrl: null,
      previewSiteGeneratedAt: new Date().toISOString(),
      status: "site_generated",
    });
  }

  const url = await deployStaticSite(slug, html);
  logger.info(`Site publicado para "${lead.name}": ${url}`);

  return leadStore.update(lead.id, {
    previewSiteSlug: slug,
    previewSiteUrl: url,
    previewSiteGeneratedAt: new Date().toISOString(),
    status: "site_deployed",
  });
}

export async function publishSitesForReadyLeads(): Promise<{ ok: number; failed: number }> {
  const pending = leadStore.byStatus("email_ready");
  let ok = 0;
  let failed = 0;

  for (const lead of pending) {
    try {
      await publishSiteForLead(lead);
      ok++;
    } catch (err) {
      logger.error(`Falha ao gerar/publicar site de "${lead.name}":`, (err as Error).message);
      leadStore.update(lead.id, { lastError: (err as Error).message });
      failed++;
    }
    await leadStore.save();
  }

  return { ok, failed };
}
