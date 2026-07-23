import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type { Lead } from "../types.js";

const TEMPLATE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "templates",
  "site",
  "index.html"
);

export function slugify(value: string, suffix: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base.slice(0, 40)}-${suffix}`;
}

function buildTagline(lead: Lead): string {
  const categoria = lead.category ?? lead.cnpjAtividade ?? "negocio local";
  return `${categoria} em ${lead.city ?? "sua regiao"} - atendimento de confianca`;
}

function buildAboutText(lead: Lead): string {
  const categoria = lead.category ?? lead.cnpjAtividade ?? "atendimento";
  const cidade = lead.city ? ` em ${lead.city}` : "";
  return (
    `${lead.name} atua com ${categoria.toLowerCase()}${cidade}. ` +
    `Este site foi montado como exemplo de como a empresa pode aparecer ` +
    `para quem pesquisa no Google ou recebe uma indicacao, com um espaco ` +
    `simples para conte'udo, contato e prova de credibilidade.`
  );
}

function whatsAppLink(phone: string | null, businessName: string): string {
  const digits = phone?.replace(/\D/g, "") ?? "";
  const text = encodeURIComponent(`Ola! Vi o site de vocês (${businessName}) e gostaria de mais informações.`);
  if (!digits) return "#";
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${text}`;
}

export async function generateSiteHtml(lead: Lead): Promise<string> {
  const template = await readFile(TEMPLATE_PATH, "utf-8");

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": lead.name,
    "{{CATEGORY}}": lead.category ?? lead.cnpjAtividade ?? "Negocio local",
    "{{CITY}}": lead.city ?? "",
    "{{TAGLINE}}": buildTagline(lead),
    "{{ABOUT_TEXT}}": buildAboutText(lead),
    "{{ADDRESS}}": lead.address ?? "Endereco sob consulta",
    "{{PHONE}}": lead.phone ?? "Sob consulta",
    "{{WHATSAPP_LINK}}": whatsAppLink(lead.phone, lead.name),
    "{{PINDO_WEBSITE}}": config.pindo.website,
  };

  let html = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.split(placeholder).join(value);
  }
  return html;
}
