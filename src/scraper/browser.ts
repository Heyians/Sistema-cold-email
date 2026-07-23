import { chromium, type Browser } from "playwright";

const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

function proxyConfig(): { server: string } | undefined {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  return proxyUrl ? { server: proxyUrl } : undefined;
}

/**
 * Lanca o Chromium do Playwright. Em ambientes com o Chromium ja
 * pre-instalado em um caminho fixo (ex: sandboxes de CI/dev), usa esse
 * executavel em vez de exigir `playwright install`. Tambem repassa o
 * HTTPS_PROXY do ambiente para o navegador (o Chromium nao le essa env
 * var sozinho).
 */
export async function launchChromium(headless: boolean): Promise<Browser> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? PREINSTALLED_CHROMIUM;
  const proxy = proxyConfig();
  try {
    const { existsSync } = await import("node:fs");
    if (existsSync(executablePath)) {
      return chromium.launch({ headless, executablePath, proxy });
    }
  } catch {
    // segue para o launch padrao do Playwright
  }
  return chromium.launch({ headless, proxy });
}
