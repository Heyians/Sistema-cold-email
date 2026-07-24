export type LeadStatus =
  | "found"
  | "skipped_has_website"
  | "no_website"
  | "cnpj_not_found"
  | "needs_manual_email"
  | "email_ready"
  | "site_generated"
  | "site_deployed"
  | "email_composed"
  | "sent"
  | "send_failed"
  | "unsubscribed";

export interface Lead {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  rating: number | null;
  reviewsCount: number | null;
  mapsUrl: string | null;

  hasWebsite: boolean;
  website: string | null;

  cnpj: string | null;
  cnpjRazaoSocial: string | null;
  cnpjAtividade: string | null;
  cnpjSituacao: string | null;

  email: string | null;
  emailSource: "cnpj_lookup" | "manual_csv" | "source_tag" | null;

  previewSiteSlug: string | null;
  previewSiteUrl: string | null;
  previewSiteGeneratedAt: string | null;

  emailSubject: string | null;
  emailBody: string | null;
  emailComposedAt: string | null;

  status: LeadStatus;
  unsubscribed: boolean;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface RawMapsListing {
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviewsCount: number | null;
  mapsUrl: string | null;
  website: string | null;
  /** Email ja vindo da propria fonte (ex: tag do OSM), quando disponivel. */
  email?: string | null;
}
