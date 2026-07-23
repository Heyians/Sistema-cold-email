import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import { onlyDigits } from "./cnpjValidation.js";

export interface CnpjRecord {
  cnpj: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  atividadePrincipal: string | null;
  email: string | null;
  telefone: string | null;
  municipio: string | null;
  uf: string | null;
}

let lastCallAt = 0;
async function throttle(): Promise<void> {
  const minDelay = config.cnpj.minDelayMs;
  const elapsed = Date.now() - lastCallAt;
  if (elapsed < minDelay) await sleep(minDelay - elapsed);
  lastCallAt = Date.now();
}

interface BrasilApiResponse {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  cnae_fiscal_descricao: string | null;
  email: string | null;
  ddd_telefone_1: string | null;
  municipio: string | null;
  uf: string | null;
}

async function lookupBrasilApi(cnpjDigits: string): Promise<CnpjRecord | null> {
  await throttle();
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
  if (!res.ok) return null;
  const data = (await res.json()) as BrasilApiResponse;
  return {
    cnpj: cnpjDigits,
    razaoSocial: data.razao_social ?? null,
    nomeFantasia: data.nome_fantasia ?? null,
    situacao: data.descricao_situacao_cadastral ?? null,
    atividadePrincipal: data.cnae_fiscal_descricao ?? null,
    email: data.email || null,
    telefone: data.ddd_telefone_1 || null,
    municipio: data.municipio ?? null,
    uf: data.uf ?? null,
  };
}

interface ReceitaWsResponse {
  status?: string;
  nome: string | null;
  fantasia: string | null;
  situacao: string | null;
  atividade_principal?: { text: string }[];
  email: string | null;
  telefone: string | null;
  municipio: string | null;
  uf: string | null;
}

async function lookupReceitaWs(cnpjDigits: string): Promise<CnpjRecord | null> {
  await throttle();
  const res = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpjDigits}`);
  if (!res.ok) return null;
  const data = (await res.json()) as ReceitaWsResponse;
  if (data.status === "ERROR") return null;
  return {
    cnpj: cnpjDigits,
    razaoSocial: data.nome ?? null,
    nomeFantasia: data.fantasia ?? null,
    situacao: data.situacao ?? null,
    atividadePrincipal: data.atividade_principal?.[0]?.text ?? null,
    email: data.email || null,
    telefone: data.telefone || null,
    municipio: data.municipio ?? null,
    uf: data.uf ?? null,
  };
}

function mergePreferNonNull(primary: CnpjRecord, secondary: CnpjRecord | null): CnpjRecord {
  if (!secondary) return primary;
  const merged = { ...primary };
  for (const key of Object.keys(merged) as (keyof CnpjRecord)[]) {
    if (merged[key] === null && secondary[key] !== null) {
      (merged as Record<string, unknown>)[key] = secondary[key] as unknown;
    }
  }
  return merged;
}

/**
 * Busca os dados oficiais do CNPJ. Tenta o provedor configurado primeiro;
 * se o email vier vazio, tenta o provedor alternativo (os dois espelham a
 * Receita Federal mas com atualizacoes de cache diferentes, entao um pode
 * ter o email preenchido e o outro nao).
 */
export async function lookupCnpj(cnpjRaw: string): Promise<CnpjRecord | null> {
  const digits = onlyDigits(cnpjRaw);
  const providers =
    config.cnpj.provider === "receitaws"
      ? [lookupReceitaWs, lookupBrasilApi]
      : [lookupBrasilApi, lookupReceitaWs];

  let record: CnpjRecord | null = null;
  for (const provider of providers) {
    try {
      const result = await provider(digits);
      if (!result) continue;
      record = record ? mergePreferNonNull(record, result) : result;
      if (record.email) break;
    } catch (err) {
      logger.warn(`Falha ao consultar CNPJ ${digits}:`, (err as Error).message);
    }
  }
  return record;
}
