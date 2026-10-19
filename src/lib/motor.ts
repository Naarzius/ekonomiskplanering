/* Brygga till planeringsappens räknemotor.
 * Motorns filer används precis som de ligger i public/planering. Ingen
 * matematik får dupliceras i React-lagret: allt som visas i siffror ska
 * komma ur ett anrop hit. */

declare global {
  interface Window {
    Modell?: Record<string, unknown> & { basIndata: () => unknown };
    AgentAPI?: Record<string, (...args: unknown[]) => unknown>;
  }
}

const FILER = [
  "/planering/data/underlag.js",
  "/planering/app/modell.js",
  "/planering/app/agent-api.js",
];

let laddning: Promise<void> | null = null;

function laddaSkript(src: string) {
  return new Promise<void>((klar, fel) => {
    if (document.querySelector(`script[data-motor="${src}"]`)) return klar();
    const el = document.createElement("script");
    el.src = src;
    el.async = false;
    el.dataset["motor"] = src;
    el.onload = () => klar();
    el.onerror = () => fel(new Error(`Kunde inte ladda ${src}`));
    document.head.appendChild(el);
  });
}

export type Motor = { API: NonNullable<Window["AgentAPI"]>; Modell: NonNullable<Window["Modell"]> };

/* Använder planeringsvyns redan laddade motor när den finns, så att
 * styrelsevyn och planeringen alltid räknar med exakt samma kod. */
export async function motor(): Promise<Motor> {
  const ram = document.querySelector<HTMLIFrameElement>('iframe[src*="/planering/"]');
  try {
    const w = ram?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (w?.AgentAPI && w.Modell) return { API: w.AgentAPI, Modell: w.Modell };
  } catch {
    /* faller tillbaka på egen laddning */
  }
  await laddaMotor();
  if (!window.AgentAPI || !window.Modell) throw new Error("Räknemotorn kunde inte startas.");
  return { API: window.AgentAPI, Modell: window.Modell };
}

export function laddaMotor() {
  if (!laddning) {
    laddning = (async () => {
      for (const fil of FILER) await laddaSkript(fil);
    })();
  }
  return laddning;
}
