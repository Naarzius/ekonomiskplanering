import { bedom, formatera, STATUSTEXT, type Mal, type Status } from "@/lib/mal";

export const STYRELSEAR = [2026, 2027, 2028, 2029, 2030];

const KLASS: Record<Status, string> = {
  inom: "bg-ok/12 text-ok",
  nara: "bg-varning/15 text-varning",
  brutet: "bg-destructive/12 text-destructive font-semibold",
};

const MARKE: Record<Status, string> = { inom: "", nara: "!", brutet: "×" };

/** Nyckeltal per år, varje cell märkt mot målet i både färg och tecken. */
export function Nyckeltabell({
  nyckeltal,
  malLista,
  ar = STYRELSEAR,
}: {
  nyckeltal: Record<string, unknown>;
  malLista: Mal[];
  ar?: number[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Nyckeltal</th>
            <th className="py-2 pr-3 font-medium">Mål</th>
            {ar.map((y) => (
              <th key={y} className="py-2 px-2 text-right font-medium">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {malLista.map((mal) => {
            const serie = (nyckeltal[mal.matt] ?? {}) as Record<number, number>;
            return (
              <tr key={mal.matt} className="border-t border-border">
                <td className="py-2 pr-3 text-foreground">{mal.etikett}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                  {mal.riktning === "minst" ? "minst" : "högst"} {formatera(mal.grans, mal.enhet)}{" "}
                  {mal.enhet}
                </td>
                {ar.map((y) => {
                  const v = serie[y];
                  const s = typeof v === "number" ? bedom(v, mal) : null;
                  return (
                    <td key={y} className="px-1 py-1 text-right">
                      <span
                        title={s ? STATUSTEXT[s] : undefined}
                        className={`inline-flex min-w-16 justify-end gap-1 rounded px-2 py-1 ${s ? KLASS[s] : ""}`}
                      >
                        {formatera(v, mal.enhet)}
                        {s && MARKE[s] && <span aria-label={STATUSTEXT[s]}>{MARKE[s]}</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>
          <span className="text-ok">■</span> Inom mål
        </span>
        <span>
          <span className="text-varning">■ !</span> Nära gränsen
        </span>
        <span>
          <span className="text-destructive">■ ×</span> Målet bryts
        </span>
      </p>
    </div>
  );
}
