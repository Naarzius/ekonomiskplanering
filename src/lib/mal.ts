/** Styrnyckeltal och mål. Ren logik, ingen räkning av själva utfallet. */

export type Mal = {
  matt: string;
  etikett: string;
  riktning: "minst" | "hogst";
  grans: number;
  marginal: number;
  enhet: string;
  exempel: boolean;
};

export type Status = "inom" | "nara" | "brutet";

export const STATUSTEXT: Record<Status, string> = {
  inom: "Inom mål",
  nara: "Nära gränsen",
  brutet: "Målet bryts",
};

/** Brutet om värdet passerar gränsen, nära om det ligger inom marginalen från den. */
export function bedom(varde: number, mal: Pick<Mal, "riktning" | "grans" | "marginal">): Status {
  const avstand = mal.riktning === "minst" ? varde - mal.grans : mal.grans - varde;
  if (avstand < 0) return "brutet";
  if (avstand <= mal.marginal) return "nara";
  return "inom";
}

type Serie = Record<string, number>;

/** Första året varje mål bryts, som läsbara meningar. */
export function varningar(
  nyckeltal: Record<string, unknown>,
  malLista: Mal[],
  ar: number[],
): string[] {
  const ut: string[] = [];
  for (const mal of malLista) {
    const serie = nyckeltal[mal.matt] as Serie | undefined;
    if (!serie) continue;
    const forsta = ar.find(
      (y) => typeof serie[y] === "number" && bedom(serie[y], mal) === "brutet",
    );
    if (forsta !== undefined) {
      const ord = mal.riktning === "minst" ? "understiger" : "överstiger";
      ut.push(`${mal.etikett} ${ord} målet ${forsta}.`);
    }
  }
  return ut;
}

export function formatera(varde: number | undefined, enhet: string) {
  if (typeof varde !== "number") return "–";
  const dec = enhet === "ggr" ? 2 : 1;
  return varde.toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
