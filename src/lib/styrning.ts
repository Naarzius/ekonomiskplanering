/* Mål och publicerade scenarier.
 *
 * Allt sparas i webbläsarens localStorage. Det räcker för en demo och för
 * en enskild controller. Vill man dela styrelsevyn mellan flera personer
 * byter man ut funktionerna i den här filen mot anrop till en databas; det
 * är det enda stället React-lagret läser och skriver sådana data. */

import { motor } from "@/lib/motor";
import type { Mal } from "@/lib/mal";

const NYCKEL_MAL = "ekplan_mal_v1";
const NYCKEL_PUBLICERADE = "ekplan_publicerade_v1";

/** Planeringsvyns egen lagringsnyckel (se public/planering/app/ui.js). */
export const NYCKEL_PLANERING = "ekplan_v2";

/* Måtten är de som räknemotorn lämnar i API.utfall(...).nyckeltal.
 * Gränserna är exempel anpassade till demounderlaget och ska ersättas av
 * bolagets egna, ur ägardirektiv och finanspolicy. */
export const STANDARDMAL: Mal[] = [
  {
    matt: "rantetackningsgrad",
    etikett: "Räntetäckningsgrad",
    riktning: "minst",
    grans: 1.5,
    marginal: 0.3,
    enhet: "ggr",
    exempel: true,
  },
  {
    matt: "resultat_efter_finansnetto",
    etikett: "Resultat efter finansiella poster",
    riktning: "minst",
    grans: 50,
    marginal: 20,
    enhet: "mnkr",
    exempel: true,
  },
  {
    matt: "driftnettomarginal_pct",
    etikett: "Driftnettomarginal",
    riktning: "minst",
    grans: 42,
    marginal: 3,
    enhet: "%",
    exempel: true,
  },
  {
    matt: "laneskuld_ub",
    etikett: "Låneskuld, utgående",
    riktning: "hogst",
    grans: 4900,
    marginal: 150,
    enhet: "mnkr",
    exempel: true,
  },
  {
    matt: "kassaflode_efter_investeringar",
    etikett: "Kassaflöde efter investeringar",
    riktning: "minst",
    grans: -150,
    marginal: 30,
    enhet: "mnkr",
    exempel: true,
  },
];

function las<T>(nyckel: string): T | null {
  try {
    const ra = localStorage.getItem(nyckel);
    return ra ? (JSON.parse(ra) as T) : null;
  } catch {
    return null;
  }
}

function skriv(nyckel: string, varde: unknown) {
  localStorage.setItem(nyckel, JSON.stringify(varde));
}

export async function hamtaMal(): Promise<Mal[]> {
  const sparade = las<Mal[]>(NYCKEL_MAL);
  if (!sparade) return STANDARDMAL.map((m) => ({ ...m }));
  // Nya standardmål som tillkommit efter att användaren sparat läggs till sist.
  const finns = new Set(sparade.map((m) => m.matt));
  return [...sparade, ...STANDARDMAL.filter((m) => !finns.has(m.matt)).map((m) => ({ ...m }))];
}

export async function sparaMal(mal: Mal): Promise<void> {
  const alla = await hamtaMal();
  skriv(
    NYCKEL_MAL,
    alla.map((m) =>
      m.matt === mal.matt ? { ...m, grans: mal.grans, marginal: mal.marginal, exempel: false } : m,
    ),
  );
}

export async function aterstallMal(): Promise<Mal[]> {
  localStorage.removeItem(NYCKEL_MAL);
  return hamtaMal();
}

export type Publicerat = {
  id: string;
  namn: string;
  beskrivning: string;
  kommentar: string;
  indata: unknown;
  created_at: string;
};

export async function hamtaPublicerade(): Promise<Publicerat[]> {
  return las<Publicerat[]>(NYCKEL_PUBLICERADE) ?? [];
}

export async function publicera(p: Omit<Publicerat, "id" | "created_at">): Promise<Publicerat> {
  const ny: Publicerat = {
    ...p,
    id: "pub" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created_at: new Date().toISOString(),
  };
  skriv(NYCKEL_PUBLICERADE, [...(await hamtaPublicerade()), ny]);
  return ny;
}

export async function avpublicera(id: string): Promise<void> {
  skriv(
    NYCKEL_PUBLICERADE,
    (await hamtaPublicerade()).filter((p) => p.id !== id),
  );
}

/** Nyckeltal för sparad indata, räknade i planeringsvyns egen motor. */
export async function nyckeltalFor(indata: unknown) {
  const { API } = await motor();
  return API["utfallIndata"]!(indata) as Record<string, unknown>;
}

export async function nyckeltalForScenario(scenario: Record<string, unknown>) {
  const { API } = await motor();
  return (API["utfall"]!(scenario) as { nyckeltal: Record<string, unknown> }).nyckeltal;
}

/** Läser det scenario som är aktivt i planeringsvyn just nu. */
export function aktivtLokaltScenario() {
  const s = las<{
    aktivId?: string;
    scenarier?: Array<{ id: string; namn: string; beskrivning?: string; indata?: unknown }>;
  }>(NYCKEL_PLANERING);
  if (!s) return null;
  return s.scenarier?.find((x) => x.id === s.aktivId) ?? null;
}
