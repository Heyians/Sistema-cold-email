export interface TagFilter {
  key: string;
  value: string;
}

export interface SpecialtyDef {
  label: string;
  filters: TagFilter[];
}

/**
 * Mapeia termos comuns de busca (pt-BR) para tags do OpenStreetMap.
 * Cada termo gera uma uniao (OR) dos filtros listados. Cobertura no OSM
 * varia por regiao — geralmente menor que o Google Maps, mas e' dado
 * aberto, gratuito e consultavel via API (sem risco de bloqueio/ToS).
 */
export const HEALTH_SPECIALTIES: Record<string, SpecialtyDef> = {
  dentista: {
    label: "Dentista",
    filters: [
      { key: "amenity", value: "dentist" },
      { key: "healthcare", value: "dentist" },
    ],
  },
  dermatologista: {
    label: "Dermatologista",
    filters: [
      { key: "healthcare:speciality", value: "dermatology" },
      { key: "healthcare", value: "dermatologist" },
    ],
  },
  fisioterapeuta: {
    label: "Fisioterapeuta",
    filters: [
      { key: "healthcare:speciality", value: "physiotherapy" },
      { key: "healthcare", value: "physiotherapist" },
    ],
  },
  psicologo: {
    label: "Psicologo",
    filters: [
      { key: "healthcare:speciality", value: "psychology" },
      { key: "healthcare", value: "psychotherapist" },
    ],
  },
  nutricionista: {
    label: "Nutricionista",
    filters: [
      { key: "healthcare:speciality", value: "nutrition" },
      { key: "healthcare", value: "nutritionist" },
    ],
  },
  cardiologista: {
    label: "Cardiologista",
    filters: [{ key: "healthcare:speciality", value: "cardiology" }],
  },
  ginecologista: {
    label: "Ginecologista",
    filters: [{ key: "healthcare:speciality", value: "gynaecology" }],
  },
  pediatra: {
    label: "Pediatra",
    filters: [{ key: "healthcare:speciality", value: "paediatrics" }],
  },
  ortopedista: {
    label: "Ortopedista",
    filters: [{ key: "healthcare:speciality", value: "orthopaedics" }],
  },
  oftalmologista: {
    label: "Oftalmologista",
    filters: [{ key: "healthcare:speciality", value: "ophthalmology" }],
  },
  psiquiatra: {
    label: "Psiquiatra",
    filters: [{ key: "healthcare:speciality", value: "psychiatry" }],
  },
  "clinica geral": {
    label: "Clinica geral",
    filters: [
      { key: "amenity", value: "doctors" },
      { key: "healthcare", value: "doctor" },
    ],
  },
  veterinario: {
    label: "Veterinario",
    filters: [{ key: "amenity", value: "veterinary" }],
  },
  urologista: {
    label: "Urologista",
    filters: [{ key: "healthcare:speciality", value: "urology" }],
  },
  endocrinologista: {
    label: "Endocrinologista",
    filters: [{ key: "healthcare:speciality", value: "endocrinology" }],
  },
  reumatologista: {
    label: "Reumatologista",
    filters: [{ key: "healthcare:speciality", value: "rheumatology" }],
  },
  geriatra: {
    label: "Geriatra",
    filters: [{ key: "healthcare:speciality", value: "geriatrics" }],
  },
  otorrinolaringologista: {
    label: "Otorrinolaringologista",
    filters: [{ key: "healthcare:speciality", value: "otolaryngology" }],
  },
  neurologista: {
    label: "Neurologista",
    filters: [{ key: "healthcare:speciality", value: "neurology" }],
  },
  obstetra: {
    label: "Obstetra",
    filters: [{ key: "healthcare:speciality", value: "obstetrics" }],
  },
  fonoaudiologo: {
    label: "Fonoaudiologo",
    filters: [{ key: "healthcare:speciality", value: "speech_therapist" }],
  },
  clinica: {
    label: "Clinica",
    filters: [
      { key: "amenity", value: "clinic" },
      { key: "healthcare", value: "clinic" },
    ],
  },
  laboratorio: {
    label: "Laboratorio",
    filters: [{ key: "healthcare", value: "laboratory" }],
  },
};

export function resolveSpecialty(term: string): SpecialtyDef | null {
  const key = term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return HEALTH_SPECIALTIES[key] ?? null;
}
