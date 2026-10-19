import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motor } from "@/lib/motor";
import { aktivtLokaltScenario, publicera } from "@/lib/styrning";

/** Publicerar planeringsvyns aktiva scenario till styrelsevyn. */
export function Publicera({ oppen, onStang }: { oppen: boolean; onStang: () => void }) {
  const [namn, setNamn] = useState("");
  const [beskrivning, setBeskrivning] = useState("");
  const [kommentar, setKommentar] = useState("");
  const [medd, setMedd] = useState<string | null>(null);
  const [jobbar, setJobbar] = useState(false);

  useEffect(() => {
    if (!oppen) return;
    const a = aktivtLokaltScenario();
    setNamn(a?.namn ?? "");
    setBeskrivning(a?.beskrivning ?? "");
    setKommentar("");
    setMedd(a ? null : "Välj ett scenario i planeringen först.");
  }, [oppen]);

  async function skicka() {
    const a = aktivtLokaltScenario();
    if (!a) return;
    setJobbar(true);
    try {
      const indata = a.indata ?? (await motor()).API["indata"]!({});
      await publicera({ namn: namn.trim() || a.namn, beskrivning, kommentar, indata });
      setMedd("Publicerat. Scenariot syns nu i styrelsevyn.");
      window.setTimeout(onStang, 1200);
    } catch {
      setMedd("Kunde inte publicera.");
    } finally {
      setJobbar(false);
    }
  }

  return (
    <Dialog open={oppen} onOpenChange={(o) => !o && onStang()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publicera till styrelsevyn</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Det scenario du har öppet i planeringen sparas som det ser ut nu. Senare ändringar
          påverkar inte den publicerade versionen.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pub-namn">Namn</Label>
            <Input id="pub-namn" value={namn} onChange={(e) => setNamn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-besk">Kort beskrivning</Label>
            <Input
              id="pub-besk"
              value={beskrivning}
              onChange={(e) => setBeskrivning(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pub-komm">Vad innebär det? (visas för styrelsen)</Label>
            <Textarea
              id="pub-komm"
              rows={4}
              value={kommentar}
              onChange={(e) => setKommentar(e.target.value)}
            />
          </div>
        </div>
        {medd && <p className="text-sm text-primary">{medd}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onStang}>
            Avbryt
          </Button>
          <Button onClick={() => void skicka()} disabled={jobbar || !aktivtLokaltScenario()}>
            {jobbar ? "Publicerar…" : "Publicera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
