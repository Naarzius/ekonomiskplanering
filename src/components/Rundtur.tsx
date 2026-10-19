import { useCallback, useEffect, useState } from "react";
import { RUNDTUR_STEG } from "@/lib/rundtur-steg";
import { Button } from "@/components/ui/button";

export const RUNDTUR_HANDELSE = "ekplan-starta-rundtur";
/** "ja" om guiden ska starta varje gång appen öppnas. */
export const GUIDE_ALLTID_NYCKEL = "ekplan_guide_alltid";
const KLAR_NYCKEL = "ekplan_rundtur_klar";

function lasFlagga(nyckel: string) {
  try {
    return localStorage.getItem(nyckel) === "ja";
  } catch {
    return false;
  }
}

type Rekt = { top: number; left: number; width: number; height: number };

function hittaRekt(steg: (typeof RUNDTUR_STEG)[number]): Rekt | null {
  let el: Element | null = null;
  if (steg.sidMal) {
    el = document.querySelector(steg.sidMal);
  } else if (steg.iframeMal) {
    const ram = document.querySelector<HTMLIFrameElement>('iframe[src*="/planering/"]');
    let dok: Document | null = null;
    try {
      dok = ram?.contentDocument ?? null;
    } catch {
      dok = null;
    }
    el = dok?.querySelector(steg.iframeMal) ?? null;
    if (el && ram) {
      const r = el.getBoundingClientRect();
      const ramRekt = ram.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return {
        top: r.top + ramRekt.top,
        left: r.left + ramRekt.left,
        width: r.width,
        height: r.height,
      };
    }
    return null;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function Rundtur() {
  const [aktiv, setAktiv] = useState(false);
  const [steg, setSteg] = useState(0);
  const [rekt, setRekt] = useState<Rekt | null>(null);

  const totalt = RUNDTUR_STEG.length;
  const aktuellt = RUNDTUR_STEG[steg];

  // Första gången visas guiden av sig själv. Därefter bara om användaren
  // slagit på "Guide vid start" eller trycker på "Visa guiden".
  useEffect(() => {
    if (!lasFlagga(GUIDE_ALLTID_NYCKEL) && lasFlagga(KLAR_NYCKEL)) return;
    const timer = window.setTimeout(() => setAktiv(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    function starta() {
      setSteg(0);
      setAktiv(true);
    }
    window.addEventListener(RUNDTUR_HANDELSE, starta);
    return () => window.removeEventListener(RUNDTUR_HANDELSE, starta);
  }, []);

  useEffect(() => {
    if (!aktiv || !aktuellt) return;
    const uppdatera = () => setRekt(hittaRekt(aktuellt));
    uppdatera();
    const id = window.setInterval(uppdatera, 250);
    window.addEventListener("resize", uppdatera);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", uppdatera);
    };
  }, [aktiv, aktuellt]);

  const avsluta = useCallback(() => {
    setAktiv(false);
    try {
      localStorage.setItem(KLAR_NYCKEL, "ja");
    } catch {
      /* strunt samma */
    }
  }, []);

  const nasta = useCallback(() => {
    setSteg((s) => {
      if (s < totalt - 1) return s + 1;
      avsluta();
      return s;
    });
  }, [totalt, avsluta]);

  const bakat = useCallback(() => setSteg((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!aktiv) return;
    function tangent(e: KeyboardEvent) {
      if (e.key === "Escape") avsluta();
      if (e.key === "ArrowRight") nasta();
      if (e.key === "ArrowLeft") bakat();
    }
    window.addEventListener("keydown", tangent);
    return () => window.removeEventListener("keydown", tangent);
  }, [aktiv, avsluta, nasta, bakat]);

  if (!aktiv || !aktuellt) return null;

  const luft = 8;
  const clipPath = rekt
    ? `polygon(0% 0%, 0% 100%, ${rekt.left - luft}px 100%, ${rekt.left - luft}px ${rekt.top - luft}px, ${rekt.left + rekt.width + luft}px ${rekt.top - luft}px, ${rekt.left + rekt.width + luft}px ${rekt.top + rekt.height + luft}px, ${rekt.left - luft}px ${rekt.top + rekt.height + luft}px, ${rekt.left - luft}px 100%, 100% 100%, 100% 0%)`
    : undefined;

  const underMalet = rekt ? rekt.top + rekt.height + 260 < window.innerHeight : false;
  const kortStil: React.CSSProperties = rekt
    ? {
        position: "fixed",
        left: Math.max(16, Math.min(rekt.left, window.innerWidth - 360)),
        ...(underMalet
          ? { top: rekt.top + rekt.height + luft + 12 }
          : { top: Math.max(16, rekt.top - luft - 12), transform: "translateY(-100%)" }),
        zIndex: 80,
      }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 80,
      };

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute inset-0 bg-foreground/55 transition-all duration-300"
        style={{ clipPath }}
        onClick={avsluta}
      />
      {rekt && (
        <div
          className="pointer-events-none absolute rounded-lg border-2 border-primary transition-all duration-300"
          style={{
            top: rekt.top - luft,
            left: rekt.left - luft,
            width: rekt.width + luft * 2,
            height: rekt.height + luft * 2,
            zIndex: 75,
          }}
        />
      )}

      <div
        style={kortStil}
        className="w-[min(340px,92vw)] animate-in fade-in zoom-in-95 duration-200 rounded-xl border border-border bg-card p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {steg + 1} / {totalt}
          </span>
          <button
            type="button"
            onClick={avsluta}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Hoppa över
          </button>
        </div>

        <h3 className="mt-2 text-sm font-semibold text-foreground">{aktuellt.rubrik}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{aktuellt.text}</p>

        <div className="mt-3 flex items-center justify-center gap-1">
          {RUNDTUR_STEG.map((s, i) => (
            <span
              key={s.rubrik}
              className={
                "h-1 rounded-full transition-all " +
                (i === steg
                  ? "w-4 bg-primary"
                  : i < steg
                    ? "w-1 bg-primary/40"
                    : "w-1 bg-muted-foreground/30")
              }
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={bakat} disabled={steg === 0}>
            Tillbaka
          </Button>
          <Button size="sm" onClick={nasta}>
            {steg === totalt - 1 ? "Kom igång" : "Nästa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
