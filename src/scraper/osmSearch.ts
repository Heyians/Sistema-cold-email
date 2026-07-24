import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import type { RawMapsListing } from "../types.js";
import { resolveSpecialty, type TagFilter } from "./healthSpecialties.js";

const USER_AGENT = "pindo-cold-email/1.0 (contato: contato@pindo.com.br)";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

async function geocodeCity(location: string): Promise<BoundingBox> {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim falhou (${res.status}) para "${location}"`);
  const data = (await res.json()) as { boundingbox: string[] }[];
  if (data.length === 0) throw new Error(`Cidade nao encontrada: "${location}"`);
  const [south, north, west, east] = data[0].boundingbox.map(Number);
  return { south, north, west, east };
}

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string;
}

function buildQuery(filters: TagFilter[], bbox: BoundingBox, maxResults: number): string {
  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const clauses = filters
    .map((f) => `  node["${f.key}"="${f.value}"](${bboxStr});`)
    .join("\n");
  return `[out:json][timeout:40];\n(\n${clauses}\n);\nout body ${maxResults};`;
}

async function runOverpassQuery(query: string, attempt = 1): Promise<OverpassElement[]> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "*/*",
      "User-Agent": USER_AGENT,
    },
    body: query,
  });

  const text = await res.text();
  if (!res.ok || text.trim().startsWith("<")) {
    if (attempt < 3) {
      const wait = 4000 * attempt;
      logger.warn(`Overpass API ocupada, tentando de novo em ${wait}ms (tentativa ${attempt})...`);
      await sleep(wait);
      return runOverpassQuery(query, attempt + 1);
    }
    throw new Error(`Overpass API indisponivel apos ${attempt} tentativas`);
  }

  const data = JSON.parse(text) as OverpassResponse;
  return data.elements;
}

function formatAddress(tags: Record<string, string>): string | null {
  const parts = [
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", "),
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : null;
}

const PUBLIC_FACILITY_NAME_PATTERN =
  /\b(UBS|UPA|AMA|CAPS|CEO|pronto[ -]atendimento|hospital municipal|hospital estadual|posto de sa[uú]de|policlinica municipal|secretaria (municipal|estadual) de sa[uú]de)\b/i;

/** Pindo vende site + cold email para negocios privados — nao faz sentido prospectar um servico publico de saude. */
function isPublicHealthFacility(name: string, email: string | null): boolean {
  if (email && /\.gov\.br$/i.test(email)) return true;
  if (PUBLIC_FACILITY_NAME_PATTERN.test(name)) return true;
  return false;
}

function elementToListing(el: OverpassElement, categoryLabel: string): RawMapsListing | null {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null;

  const website = tags.website ?? tags["contact:website"] ?? null;
  const phone = tags.phone ?? tags["contact:phone"] ?? null;
  const email = tags.email ?? tags["contact:email"] ?? null;

  if (isPublicHealthFacility(name, email)) return null;

  return {
    name,
    category: categoryLabel,
    address: formatAddress(tags),
    phone,
    rating: null,
    reviewsCount: null,
    mapsUrl: `https://www.google.com/maps?q=${el.lat},${el.lon}`,
    website,
    email,
  };
}

/**
 * Busca estabelecimentos de saude no OpenStreetMap (dado aberto, gratuito,
 * sem chave de API), dentro da area de uma cidade. Cobertura no Brasil e'
 * geralmente menor que a do Google Maps, mas e' uma API de verdade (nao
 * scraping) e funciona em qualquer ambiente com acesso HTTPS normal —
 * inclusive em execucoes automatizadas/agendadas.
 */
export async function searchHealthBusinesses(
  specialtyTerm: string,
  location: string,
  maxResults: number
): Promise<RawMapsListing[]> {
  const specialty = resolveSpecialty(specialtyTerm);
  if (!specialty) {
    const known = Object.keys(await import("./healthSpecialties.js").then((m) => m.HEALTH_SPECIALTIES));
    throw new Error(
      `Especialidade "${specialtyTerm}" nao mapeada. Opcoes conhecidas: ${known.join(", ")}`
    );
  }

  logger.info(`Geocodificando "${location}"...`);
  const bbox = await geocodeCity(location);

  logger.info(`Buscando "${specialty.label}" no OpenStreetMap...`);
  const query = buildQuery(specialty.filters, bbox, maxResults * 3);
  const elements = await runOverpassQuery(query);

  const listings: RawMapsListing[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const listing = elementToListing(el, specialty.label);
    if (!listing) continue;
    const dedupeKey = `${listing.name}|${listing.address ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    listings.push(listing);
    if (listings.length >= maxResults) break;
  }

  logger.info(`Encontrados ${listings.length} estabelecimentos com nome (${elements.length} bruto).`);
  return listings;
}
