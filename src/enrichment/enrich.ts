import { leadStore } from "../db/store.js";
import { logger } from "../utils/logger.js";
import type { Lead } from "../types.js";
import { searchCnpjByName } from "./cnpjSearch.js";
import { lookupCnpj } from "./cnpjLookup.js";

/**
 * Enriquece um lead sem site: tenta achar o CNPJ pelo nome/cidade e depois
 * busca o registro oficial (email, telefone, atividade/CNAE, situacao).
 * Atualiza o status do lead conforme o resultado.
 */
export async function enrichLead(lead: Lead): Promise<Lead> {
  if (lead.status !== "no_website") {
    logger.warn(`Lead ${lead.name} nao esta em 'no_website' (status atual: ${lead.status}), pulando.`);
    return lead;
  }

  const cnpj = await searchCnpjByName(lead.name, lead.city ?? "");
  if (!cnpj) {
    return leadStore.update(lead.id, { status: "cnpj_not_found" });
  }

  const record = await lookupCnpj(cnpj);
  if (!record) {
    return leadStore.update(lead.id, { cnpj, status: "cnpj_not_found" });
  }

  const patch: Partial<Lead> = {
    cnpj: record.cnpj,
    cnpjRazaoSocial: record.razaoSocial,
    cnpjAtividade: record.atividadePrincipal,
    cnpjSituacao: record.situacao,
    phone: lead.phone ?? record.telefone,
  };

  if (record.email) {
    patch.email = record.email;
    patch.emailSource = "cnpj_lookup";
    patch.status = "email_ready";
  } else {
    patch.status = "needs_manual_email";
  }

  return leadStore.update(lead.id, patch);
}

export async function enrichAllPending(): Promise<{ ready: number; needsManual: number; notFound: number }> {
  const pending = leadStore.byStatus("no_website");
  let ready = 0;
  let needsManual = 0;
  let notFound = 0;

  for (const lead of pending) {
    logger.info(`Enriquecendo: ${lead.name} (${lead.city ?? "?"})`);
    const updated = await enrichLead(lead);
    if (updated.status === "email_ready") ready++;
    else if (updated.status === "needs_manual_email") needsManual++;
    else if (updated.status === "cnpj_not_found") notFound++;
    await leadStore.save();
  }

  return { ready, needsManual, notFound };
}
