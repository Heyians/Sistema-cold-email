import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { Lead } from "../types.js";

const EXPORT_FILE = path.join(config.paths.dataDir, "exports", "precisa_email_manual.csv");

const CSV_HEADER = "id,nome,categoria,endereco,telefone,cidade,estado,maps_url,email";

function csvEscape(value: string | null): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Exporta leads sem email encontrado para uma planilha, para preenchimento manual (ou via Hunter.io etc). */
export async function exportLeadsNeedingEmail(leads: Lead[]): Promise<string> {
  await mkdir(path.dirname(EXPORT_FILE), { recursive: true });
  const rows = leads.map((l) =>
    [
      l.id,
      csvEscape(l.name),
      csvEscape(l.category),
      csvEscape(l.address),
      csvEscape(l.phone),
      csvEscape(l.city),
      csvEscape(l.state),
      csvEscape(l.mapsUrl),
      "",
    ].join(",")
  );
  const content = [CSV_HEADER, ...rows].join("\n") + "\n";
  await writeFile(EXPORT_FILE, content, "utf-8");
  return EXPORT_FILE;
}

export interface ManualEmailEntry {
  id: string;
  email: string;
}

/** Le a planilha (apos preenchida manualmente) e retorna os pares id -> email preenchidos. */
export async function importManualEmails(filePath = EXPORT_FILE): Promise<ManualEmailEntry[]> {
  const raw = await readFile(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...dataLines] = lines;
  const entries: ManualEmailEntry[] = [];
  for (const line of dataLines) {
    const cols = line.split(",");
    const id = cols[0]?.trim();
    const email = cols[cols.length - 1]?.trim().replace(/^"|"$/g, "");
    if (id && email && email.includes("@")) {
      entries.push({ id, email });
    }
  }
  return entries;
}

export { EXPORT_FILE };
