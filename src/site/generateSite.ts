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

function categoryOf(lead: Lead): string {
  return lead.category ?? lead.cnpjAtividade ?? "Negocio local";
}

function initialOf(name: string): string {
  const firstLetter = name.trim().charAt(0).toUpperCase();
  return firstLetter || "P";
}

function buildTagline(lead: Lead): string {
  const categoria = categoryOf(lead);
  const cidade = lead.city ?? "sua regiao";
  return `${categoria} em ${cidade}, com um jeito simples de encontrar horario, endereco e falar direto no WhatsApp.`;
}

function buildAboutText(lead: Lead): string {
  const categoria = categoryOf(lead);
  const cidade = lead.city ? ` em ${lead.city}` : "";
  return (
    `${lead.name} atua com ${categoria.toLowerCase()}${cidade}. ` +
    `Esta pagina foi montada como exemplo de como a empresa pode aparecer ` +
    `para quem pesquisa no Google ou recebe uma indicacao — com espaco para ` +
    `contar o que voces fazem, mostrar contato e passar confianca antes do primeiro clique.`
  );
}

/** Monta o H1 do hero com uma palavra/frase em destaque, evitando concordancia de genero fixa. */
function buildHeroHeadlineHtml(lead: Lead): string {
  const categoria = categoryOf(lead).toLowerCase();
  return `<h1>Um site pra <span class="hl">${categoria}</span> que passa confianca antes do primeiro contato</h1>`;
}

function buildHeroBullets(lead: Lead): [string, string, string] {
  const cidade = lead.city ?? "sua regiao";
  return [
    `Visivel para quem pesquisa em ${cidade}`,
    `Endereco e horario sempre atualizados`,
    `Agendamento direto pelo WhatsApp`,
  ];
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
  const category = categoryOf(lead);
  const [bullet1, bullet2, bullet3] = buildHeroBullets(lead);

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": lead.name,
    "{{BUSINESS_INITIAL}}": initialOf(lead.name),
    "{{CATEGORY}}": category,
    "{{CATEGORY_LOWER}}": category.toLowerCase(),
    "{{CITY}}": lead.city ?? "",
    "{{TAGLINE}}": buildTagline(lead),
    "{{ABOUT_TEXT}}": buildAboutText(lead),
    "{{HERO_HEADLINE_HTML}}": buildHeroHeadlineHtml(lead),
    "{{HERO_BULLET_1}}": bullet1,
    "{{HERO_BULLET_2}}": bullet2,
    "{{HERO_BULLET_3}}": bullet3,
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
