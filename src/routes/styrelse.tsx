import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nyckeltabell, STYRELSEAR } from "@/components/Nyckeltabell";
import { Button } from "@/components/ui/button";
import { varningar, type Mal } from "@/lib/mal";
import { STRESSPAKET } from "@/lib/stress";
import {
  avpublicera,
  hamtaMal,
  hamtaPublicerade,
  nyckeltalFor,
  nyckeltalForScenario,
  type Publicerat,
} from "@/lib/styrning";

export const Route = createFileRoute("/styrelse")({
  head: () => ({
    meta: [
      { title: "Styrelsevy – Ekonomisk planering" },
      { name: "description", content: "Utvalda scenarier och styrnyckeltal mot mål." },
    ],
  }),
  component: Styrelsevy,
});

type Rad = {
  id: string;
  namn: string;
  beskrivning: string;
  kommentar: string;
  nyckeltal: Record<string, unknown>;
};

/* Styrelsevyn visar basplanen, de scenarier controllern publicerat och ett
 * antal stresstester, allt mätt mot målen. Siffrorna räknas i samma motor
 * som planeringsvyn, ur den frysta indata som publicerades. */
function Styrelsevy() {
  const [mal, setMal] = useState<Mal[]>([]);
  const [rader, setRader] = useState<Rad[] | null>(null);
  const [stress, setStress] = useState<
    Array<{ namn: string; beskrivning: string; nyckeltal: Record<string, unknown> }>
  >([]);
  const [valt, setValt] = useState(0);
  const [fel, setFel] = useState<string | null>(null);

  async function ladda() {
    try {
      const [m, pub] = await Promise.all([hamtaMal(), hamtaPublicerade()]);
      setMal(m);
      const bas: Rad = {
        id: "bas",
        namn: "Basplan",
        beskrivning: `Styrelsebudgeten ${STYRELSEAR[0]}–${STYRELSEAR[STYRELSEAR.length - 1]}.`,
        kommentar: "",
        nyckeltal: await nyckeltalForScenario({}),
      };
      const ovriga = await Promise.all(
        pub.map(async (p: Publicerat) => ({ ...p, nyckeltal: await nyckeltalFor(p.indata) })),
      );
      setRader([bas, ...ovriga]);
      setStress(
        await Promise.all(
          STRESSPAKET.map(async (s) => ({
            namn: s.namn,
            beskrivning: s.beskrivning,
            nyckeltal: await nyckeltalForScenario(s.scenario),
          })),
        ),
      );
    } catch (e) {
      setFel(e instanceof Error ? e.message : "Kunde inte läsa underlaget.");
    }
  }

  useEffect(() => {
    void ladda();
  }, []);

  async function taBort(id: string) {
    await avpublicera(id);
    setValt(0);
    void ladda();
  }

  const aktuell = rader?.[valt];
  const resultat = (r: Rad, y: number) =>
    (r.nyckeltal["resultat_efter_finansnetto"] as Record<number, number>)[y];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-4 print:border-0">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Beslutsunderlag
          </p>
          <h1 className="text-xl font-semibold">
            Ekonomisk plan {STYRELSEAR[0]}–{STYRELSEAR[STYRELSEAR.length - 1]}
          </h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button asChild variant="outline">
            <Link to="/">Till planeringen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/mal">Mål</Link>
          </Button>
          <Button onClick={() => window.print()}>Skriv ut rapport (PDF)</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-6 py-8">
        {fel && <p className="text-sm text-destructive">{fel}</p>}
        {!rader && !fel && <p className="text-sm text-muted-foreground">Räknar fram underlaget…</p>}

        {rader && (
          <>
            <section>
              <h2 className="text-lg font-semibold">Scenarier i korthet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Resultat efter finansiella poster i mnkr. Scenarierna är utvalda och publicerade
                från planeringen.
              </p>
              <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
                <table className="w-full min-w-[640px] text-sm tabular-nums">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Scenario</th>
                      {STYRELSEAR.map((y) => (
                        <th key={y} className="px-3 py-3 text-right font-medium">
                          {y}
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium">Varningar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rader.map((r, i) => {
                      const v = varningar(r.nyckeltal, mal, STYRELSEAR);
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setValt(i)}
                          className={`cursor-pointer border-t border-border transition ${i === valt ? "bg-accent" : "hover:bg-accent/50"}`}
                        >
                          <td className="px-4 py-3 font-medium">{r.namn}</td>
                          {STYRELSEAR.map((y) => (
                            <td key={y} className="px-3 py-3 text-right">
                              {resultat(r, y)?.toLocaleString("sv-SE", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                            </td>
                          ))}
                          <td
                            className={`px-4 py-3 text-xs ${v.length ? "text-destructive" : "text-ok"}`}
                          >
                            {v.length ? `${v.length} mål bryts` : "Alla mål nås"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rader.length === 1 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Inga scenarier är publicerade ännu. Publicera dem från planeringen med knappen
                  Publicera till styrelsen.
                </p>
              )}
            </section>

            {aktuell && (
              <section className="rounded-lg border border-border bg-card p-6 break-inside-avoid">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{aktuell.namn}</h2>
                    {aktuell.beskrivning && (
                      <p className="mt-1 text-sm text-muted-foreground">{aktuell.beskrivning}</p>
                    )}
                  </div>
                  {aktuell.id !== "bas" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="print:hidden"
                      onClick={() => void taBort(aktuell.id)}
                    >
                      Ta bort från styrelsevyn
                    </Button>
                  )}
                </div>
                {aktuell.kommentar && (
                  <p className="mt-4 rounded-md border-l-2 border-primary bg-background px-4 py-3 text-sm">
                    {aktuell.kommentar}
                  </p>
                )}
                <ul className="mt-4 space-y-1 text-sm">
                  {varningar(aktuell.nyckeltal, mal, STYRELSEAR).map((t) => (
                    <li key={t} className="text-destructive">
                      × {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Nyckeltabell nyckeltal={aktuell.nyckeltal} malLista={mal} />
                </div>
              </section>
            )}

            <section className="break-before-page">
              <h2 className="text-lg font-semibold">Stresstester av basplanen</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Hur basplanen klarar sig om flera saker går emot samtidigt.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {stress.map((s) => {
                  const v = varningar(s.nyckeltal, mal, STYRELSEAR);
                  return (
                    <div
                      key={s.namn}
                      className="rounded-lg border border-border bg-card p-5 break-inside-avoid"
                    >
                      <h3 className="font-semibold">{s.namn}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{s.beskrivning}</p>
                      <p className={`mt-3 text-sm ${v.length ? "text-destructive" : "text-ok"}`}>
                        {v.length ? v.join(" ") : "Alla mål nås."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {mal.some((m) => m.exempel) && (
              <p className="text-xs text-muted-foreground">
                Mål markerade som exempel är ännu inte fastställda:{" "}
                {mal
                  .filter((m) => m.exempel)
                  .map((m) => m.etikett)
                  .join(", ")}
                .
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
