import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatera, type Mal } from "@/lib/mal";
import { aterstallMal, hamtaMal, sparaMal } from "@/lib/styrning";

export const Route = createFileRoute("/mal")({
  head: () => ({
    meta: [
      { title: "Mål – Ekonomisk planering" },
      { name: "description", content: "Styrnyckeltalens mål: gräns och marginal per nyckeltal." },
    ],
  }),
  component: MalSida,
});

function MalSida() {
  const [mal, setMal] = useState<Mal[]>([]);
  const [sparat, setSparat] = useState<string | null>(null);
  // Fälten är okontrollerade; nyckeln tvingar dem att läsa om värdena efter återställning.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void hamtaMal().then(setMal);
  }, []);

  function andra(matt: string, falt: "grans" | "marginal", varde: string) {
    const tal = Number(varde.replace(/\s/g, "").replace("−", "-").replace(",", "."));
    setMal((f) =>
      f.map((m) => (m.matt === matt ? { ...m, [falt]: Number.isFinite(tal) ? tal : m[falt] } : m)),
    );
  }

  async function spara(m: Mal) {
    try {
      await sparaMal(m);
      setSparat(`${m.etikett} sparat.`);
      setMal((f) => f.map((x) => (x.matt === m.matt ? { ...x, exempel: false } : x)));
    } catch {
      setSparat("Kunde inte spara.");
    }
  }

  async function aterstall() {
    setMal(await aterstallMal());
    setVersion((v) => v + 1);
    setSparat("Exempelvärdena är återställda.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">Mål</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/">Till planeringen</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/styrelse">Styrelsevy</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 px-6 py-8">
        <section>
          <h2 className="text-lg font-semibold">Styrnyckeltal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gränsen avgör när ett mål bryts. Marginalen avgör när det markeras som nära gränsen.
            Målen sparas i den här webbläsaren.
          </p>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-card">
            {mal.map((m) => (
              <div key={m.matt + version} className="flex flex-wrap items-end gap-4 p-4">
                <div className="min-w-48 flex-1">
                  <p className="font-medium">{m.etikett}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.riktning === "minst" ? "Ska vara minst" : "Får vara högst"} gränsen
                    {m.exempel && (
                      <span className="ml-2 rounded bg-varning/15 px-1.5 py-0.5 text-varning">
                        Exempelvärde
                      </span>
                    )}
                  </p>
                </div>
                <label className="text-xs text-muted-foreground">
                  Gräns ({m.enhet})
                  <Input
                    className="mt-1 w-28"
                    defaultValue={formatera(m.grans, m.enhet)}
                    onBlur={(e) => andra(m.matt, "grans", e.target.value.replace(/\s/g, ""))}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Marginal ({m.enhet})
                  <Input
                    className="mt-1 w-28"
                    defaultValue={formatera(m.marginal, m.enhet)}
                    onBlur={(e) => andra(m.matt, "marginal", e.target.value.replace(/\s/g, ""))}
                  />
                </label>
                <Button variant="outline" onClick={() => void spara(m)}>
                  Spara
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-4">
            {sparat ? <p className="text-sm text-primary">{sparat}</p> : <span />}
            <Button variant="ghost" size="sm" onClick={() => void aterstall()}>
              Återställ exempelvärden
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
