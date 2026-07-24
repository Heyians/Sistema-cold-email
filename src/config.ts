import "dotenv/config";

function str(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v.toLowerCase() === "true" || v === "1";
}

export const config = {
  maps: {
    defaultQuery: str("MAPS_QUERY", "restaurantes")!,
    defaultLocation: str("MAPS_LOCATION", "Porto Alegre, RS")!,
    maxResults: num("MAPS_MAX_RESULTS", 30),
  },
  cnpj: {
    provider: (str("CNPJ_LOOKUP_PROVIDER", "brasilapi") as "brasilapi" | "receitaws"),
    minDelayMs: num("CNPJ_LOOKUP_MIN_DELAY_MS", 1500),
    /** Busca de CNPJ por nome usa navegador (Google Search). Desative em ambientes sem navegador/rede irrestrita. */
    nameSearchEnabled: bool("CNPJ_NAME_SEARCH_ENABLED", true),
  },
  vercel: {
    token: str("VERCEL_TOKEN"),
    teamId: str("VERCEL_TEAM_ID"),
  },
  smtp: {
    host: str("SMTP_HOST"),
    port: num("SMTP_PORT", 465),
    secure: bool("SMTP_SECURE", true),
    user: str("SMTP_USER"),
    pass: str("SMTP_PASS"),
  },
  email: {
    fromName: str("FROM_NAME", "Pindo")!,
    fromEmail: str("FROM_EMAIL"),
    replyToEmail: str("REPLY_TO_EMAIL"),
    companyPostalAddress: str("COMPANY_POSTAL_ADDRESS", "")!,
  },
  send: {
    maxPerRun: num("SEND_MAX_PER_RUN", 20),
    minDelayMs: num("SEND_MIN_DELAY_MS", 8000),
  },
  pindo: {
    website: str("PINDO_WEBSITE", "https://pindo.com.br")!,
    whatsapp: str("PINDO_WHATSAPP", "")!,
  },
  paths: {
    dataDir: new URL("../data/", import.meta.url).pathname,
  },
};

export function requireSmtpConfig() {
  const { host, user, pass } = config.smtp;
  const { fromEmail, replyToEmail } = config.email;
  const missing = [
    !host && "SMTP_HOST",
    !user && "SMTP_USER",
    !pass && "SMTP_PASS",
    !fromEmail && "FROM_EMAIL",
    !replyToEmail && "REPLY_TO_EMAIL",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(
      `Configuracao de SMTP incompleta. Defina no .env: ${missing.join(", ")}`
    );
  }
  return {
    host: host!,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: user!,
    pass: pass!,
    fromEmail: fromEmail!,
    fromName: config.email.fromName,
    replyToEmail: replyToEmail!,
  };
}

export function requireVercelToken(): string {
  if (!config.vercel.token) {
    throw new Error(
      "VERCEL_TOKEN nao configurado. Defina no .env para publicar os sites de preview."
    );
  }
  return config.vercel.token;
}
