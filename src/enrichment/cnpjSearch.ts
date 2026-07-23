import { logger } from "../utils/logger.js";
import { jitterSleep } from "../utils/sleep.js";
import { isValidCnpj, onlyDigits } from "./cnpjValidation.js";
import { launchChromium } from "../scraper/browser.js";

const CNPJ_PATTERN = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

/**
 * O Google Maps nao expoe email/CNPJ. Nao existe API publica/gratuita de
 * busca de CNPJ por nome de empresa (as oficiais so aceitam o numero do
 * CNPJ). Como aproximacao pratica, pesquisamos "<nome empresa> <cidade>
 * CNPJ" e procuramos um numero de CNPJ valido no texto dos resultados
 * (geralmente vindo de diretorios como cnpj.biz, casadosdados,
 * econodata etc. que aparecem indexados). E' best-effort: funciona melhor
 * para empresas formalizadas com alguma presenca online (nem que seja so
 * o CNPJ listado em um diretorio), e falha para negocios muito informais
 * — esses caem no fallback manual (ver csvFallback.ts).
 */
export async function searchCnpjByName(
  companyName: string,
  city: string
): Promise<string | null> {
  const query = `"${companyName}" ${city} CNPJ`;

  const browser = await launchChromium(true);
  try {
    const context = await browser.newContext({
      locale: "pt-BR",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await jitterSleep(500, 1200);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const matches = bodyText.match(CNPJ_PATTERN) ?? [];
    const validCnpjs = matches.filter((m) => isValidCnpj(m));

    if (validCnpjs.length === 0) {
      logger.warn(`Nenhum CNPJ valido encontrado para "${companyName}" (${city}).`);
      return null;
    }

    const chosen = onlyDigits(validCnpjs[0]);
    logger.info(`CNPJ encontrado para "${companyName}": ${chosen}`);
    return chosen;
  } finally {
    await browser.close();
  }
}
