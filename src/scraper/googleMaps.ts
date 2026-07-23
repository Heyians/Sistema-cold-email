import { chromium, type Browser, type Page } from "playwright";
import { logger } from "../utils/logger.js";
import { jitterSleep } from "../utils/sleep.js";
import type { RawMapsListing } from "../types.js";

/**
 * NOTA IMPORTANTE:
 * Este scraper automatiza o Google Maps via navegador (Playwright), o que
 * viola os Termos de Servico do Google. Os seletores usados aqui sao
 * baseados na estrutura publica atual da pagina e PODEM QUEBRAR quando o
 * Google mudar o layout. Use com moderacao (poucas buscas, delays altos)
 * para reduzir o risco de bloqueio de IP. Para um uso em producao/escala,
 * prefira a API oficial do Google Places.
 */

export interface ScrapeOptions {
  query: string;
  location: string;
  maxResults: number;
  headless?: boolean;
  /** Delay entre abrir cada resultado individual, em ms (evita parecer um robo martelando o site). */
  perListingDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function dismissConsentDialog(page: Page): Promise<void> {
  const candidates = [
    'button:has-text("Aceitar tudo")',
    'button:has-text("Accept all")',
    'button:has-text("Rejeitar tudo")',
    'form[action*="consent"] button',
  ];
  for (const selector of candidates) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1500 })) {
        await el.click({ timeout: 1500 });
        await jitterSleep(300, 800);
        return;
      }
    } catch {
      // seletor nao encontrado, tenta o proximo
    }
  }
}

async function scrollFeedForResults(
  page: Page,
  maxResults: number
): Promise<string[]> {
  const feedSelector = 'div[role="feed"]';
  await page.waitForSelector(feedSelector, { timeout: DEFAULT_TIMEOUT_MS });

  let hrefs: string[] = [];
  let stalledRounds = 0;
  const maxStalledRounds = 4;

  while (hrefs.length < maxResults && stalledRounds < maxStalledRounds) {
    const current = await page.$$eval(
      `${feedSelector} a[href*="/maps/place/"]`,
      (els) => Array.from(new Set(els.map((e) => (e as HTMLAnchorElement).href)))
    );

    if (current.length <= hrefs.length) {
      stalledRounds++;
    } else {
      stalledRounds = 0;
    }
    hrefs = current;

    if (hrefs.length >= maxResults) break;

    await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollBy(0, 1200);
    }, feedSelector);
    await jitterSleep(900, 1800);
  }

  return hrefs.slice(0, maxResults);
}

async function textOrNull(page: Page, selector: string): Promise<string | null> {
  try {
    const el = page.locator(selector).first();
    if (await el.count()) {
      const t = (await el.textContent())?.trim();
      return t && t.length > 0 ? t : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function parseRatingAndReviews(ariaLabel: string | null): {
  rating: number | null;
  reviewsCount: number | null;
} {
  if (!ariaLabel) return { rating: null, reviewsCount: null };
  const ratingMatch = ariaLabel.match(/([\d,.]+)\s*estrela/i);
  const reviewsMatch = ariaLabel.match(/([\d.,]+)\s*avalia/i);
  const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(",", ".")) : null;
  const reviewsCount = reviewsMatch
    ? parseInt(reviewsMatch[1].replace(/[.,]/g, ""), 10)
    : null;
  return { rating, reviewsCount };
}

async function extractListingDetails(page: Page): Promise<Omit<RawMapsListing, "mapsUrl">> {
  await page.waitForSelector("h1", { timeout: DEFAULT_TIMEOUT_MS });
  const name = (await textOrNull(page, "h1")) ?? "Empresa sem nome";

  const category = await textOrNull(page, 'button[jsaction*="category"]');

  const address = await textOrNull(page, 'button[data-item-id="address"]');

  let phone: string | null = null;
  try {
    const phoneBtn = page.locator('button[data-item-id^="phone:tel:"]').first();
    if (await phoneBtn.count()) {
      phone = (await phoneBtn.textContent())?.trim() ?? null;
    }
  } catch {
    // ignore
  }

  let website: string | null = null;
  try {
    const websiteLink = page.locator('a[data-item-id="authority"]').first();
    if (await websiteLink.count()) {
      website = await websiteLink.getAttribute("href");
    }
  } catch {
    // ignore
  }

  let ratingLabel: string | null = null;
  try {
    const ratingEl = page.locator('div.F7nice, span[aria-label*="estrela"]').first();
    if (await ratingEl.count()) {
      ratingLabel =
        (await ratingEl.getAttribute("aria-label")) ??
        (await ratingEl.textContent());
    }
  } catch {
    // ignore
  }
  const { rating, reviewsCount } = parseRatingAndReviews(ratingLabel);

  return { name, category, address, phone, website, rating, reviewsCount };
}

export async function scrapeGoogleMaps(
  opts: ScrapeOptions
): Promise<RawMapsListing[]> {
  const { query, location, maxResults, headless = true, perListingDelayMs = 2500 } = opts;
  const searchTerm = `${query} em ${location}`;

  let browser: Browser | undefined;
  const results: RawMapsListing[] = [];

  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      locale: "pt-BR",
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    logger.info(`Buscando no Google Maps: "${searchTerm}"`);
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await dismissConsentDialog(page);

    const hrefs = await scrollFeedForResults(page, maxResults);
    logger.info(`Encontrados ${hrefs.length} resultados no feed.`);

    for (const [index, href] of hrefs.entries()) {
      try {
        await page.goto(href, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT_MS });
        const details = await extractListingDetails(page);
        results.push({ ...details, mapsUrl: href });
        logger.info(
          `[${index + 1}/${hrefs.length}] ${details.name} — site: ${
            details.website ? "sim" : "NAO (lead potencial)"
          }`
        );
      } catch (err) {
        logger.warn(`Falha ao extrair detalhes de ${href}:`, (err as Error).message);
      }
      await jitterSleep(perListingDelayMs, perListingDelayMs + 1500);
    }
  } finally {
    await browser?.close();
  }

  return results;
}
