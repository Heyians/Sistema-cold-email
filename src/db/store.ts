import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { Lead, RawMapsListing } from "../types.js";

const LEADS_FILE = path.join(config.paths.dataDir, "leads.json");

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function leadIdFor(name: string, address: string | null): string {
  const key = `${normalize(name)}|${normalize(address ?? "")}`;
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}

async function ensureDataDir(): Promise<void> {
  await mkdir(config.paths.dataDir, { recursive: true });
}

export class LeadStore {
  private leads: Map<string, Lead> = new Map();
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    await ensureDataDir();
    try {
      const raw = await readFile(LEADS_FILE, "utf-8");
      const arr: Lead[] = JSON.parse(raw);
      for (const lead of arr) this.leads.set(lead.id, lead);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    this.loaded = true;
  }

  async save(): Promise<void> {
    await ensureDataDir();
    const arr = Array.from(this.leads.values()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    );
    await writeFile(LEADS_FILE, JSON.stringify(arr, null, 2), "utf-8");
  }

  all(): Lead[] {
    return Array.from(this.leads.values());
  }

  get(id: string): Lead | undefined {
    return this.leads.get(id);
  }

  byStatus(...statuses: Lead["status"][]): Lead[] {
    const set = new Set(statuses);
    return this.all().filter((l) => set.has(l.status));
  }

  /** Inserts a freshly scraped listing, or updates an existing lead's raw fields if already known. */
  upsertFromMaps(listing: RawMapsListing, city: string, state: string): Lead {
    const id = leadIdFor(listing.name, listing.address);
    const now = new Date().toISOString();
    const existing = this.leads.get(id);
    const hasWebsite = Boolean(listing.website);

    if (existing) {
      const updated: Lead = {
        ...existing,
        category: listing.category ?? existing.category,
        address: listing.address ?? existing.address,
        phone: listing.phone ?? existing.phone,
        rating: listing.rating ?? existing.rating,
        reviewsCount: listing.reviewsCount ?? existing.reviewsCount,
        mapsUrl: listing.mapsUrl ?? existing.mapsUrl,
        hasWebsite,
        website: listing.website,
        updatedAt: now,
      };
      this.leads.set(id, updated);
      return updated;
    }

    const lead: Lead = {
      id,
      name: listing.name,
      category: listing.category,
      address: listing.address,
      city,
      state,
      phone: listing.phone,
      rating: listing.rating,
      reviewsCount: listing.reviewsCount,
      mapsUrl: listing.mapsUrl,
      hasWebsite,
      website: listing.website,
      cnpj: null,
      cnpjRazaoSocial: null,
      cnpjAtividade: null,
      cnpjSituacao: null,
      email: null,
      emailSource: null,
      previewSiteSlug: null,
      previewSiteUrl: null,
      previewSiteGeneratedAt: null,
      emailSubject: null,
      emailBody: null,
      emailComposedAt: null,
      status: hasWebsite ? "skipped_has_website" : "no_website",
      unsubscribed: false,
      sentAt: null,
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.leads.set(id, lead);
    return lead;
  }

  update(id: string, patch: Partial<Lead>): Lead {
    const existing = this.leads.get(id);
    if (!existing) throw new Error(`Lead nao encontrado: ${id}`);
    const updated: Lead = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.leads.set(id, updated);
    return updated;
  }

  markUnsubscribed(email: string): number {
    let count = 0;
    for (const lead of this.leads.values()) {
      if (lead.email && lead.email.toLowerCase() === email.toLowerCase()) {
        lead.unsubscribed = true;
        lead.status = "unsubscribed";
        lead.updatedAt = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  isUnsubscribed(email: string): boolean {
    return this.all().some(
      (l) => l.unsubscribed && l.email?.toLowerCase() === email.toLowerCase()
    );
  }
}

export const leadStore = new LeadStore();
