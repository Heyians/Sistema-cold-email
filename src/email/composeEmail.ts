import { config } from "../config.js";
import { leadStore } from "../db/store.js";
import type { Lead } from "../types.js";

export function composeSubject(lead: Lead): string {
  return `${lead.name}: uma ideia de site pra voces (sem compromisso)`;
}

export function composeBody(lead: Lead): string {
  const cidade = lead.city ? ` em ${lead.city}` : "";
  const siteLine = lead.previewSiteUrl
    ? `Ja deixei um exemplo no ar pra voces verem: ${lead.previewSiteUrl}`
    : `Posso montar um exemplo rapido pra voces verem como ficaria.`;

  return [
    `Ola, tudo bem?`,
    "",
    `Encontrei a ${lead.name} no Google Maps${cidade} e vi que ainda nao tem um site.`,
    siteLine,
    "",
    `Sou da Pindo — ajudamos negocios locais a: `,
    `- ter um site simples e profissional (esse que te mandei e' so um ponto de partida)`,
    `- rodar campanhas de cold email/prospeccao pra conseguir mais clientes`,
    "",
    `Se fizer sentido, posso te mostrar em 10 minutos como isso funcionaria na pratica. Topa conversar essa semana?`,
    "",
    `Abraco,`,
    `Equipe Pindo`,
    `${config.pindo.website}${config.pindo.whatsapp ? ` | WhatsApp: ${config.pindo.whatsapp}` : ""}`,
    "",
    "---",
    "Este e' um contato comercial pontual (cold email B2B). Se preferir nao receber mais mensagens da Pindo,",
    "responda este e-mail com a palavra REMOVER que paramos o contato imediatamente.",
    config.email.companyPostalAddress ? config.email.companyPostalAddress : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
}

export function composeEmailForLead(lead: Lead): Lead {
  const subject = composeSubject(lead);
  const body = composeBody(lead);
  return leadStore.update(lead.id, {
    emailSubject: subject,
    emailBody: body,
    emailComposedAt: new Date().toISOString(),
    status: "email_composed",
  });
}

export function composeAllReadySites(): { composed: number } {
  const pending = leadStore.byStatus("site_deployed", "site_generated");
  let composed = 0;
  for (const lead of pending) {
    composeEmailForLead(lead);
    composed++;
  }
  return { composed };
}
