import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { GUIDE_ALLTID_NYCKEL, RUNDTUR_HANDELSE } from "@/components/Rundtur";
import { Publicera } from "@/components/Publicera";

/* Menyn renderas in i planeringsvyns topprad (#konto-plats i iframen), så
 * att den ser ut att höra till appen. */
function hittaPlats(): HTMLElement | null {
  const ram = document.querySelector<HTMLIFrameElement>('iframe[src*="/planering/"]');
  const dok = ram?.contentDocument;
  return dok?.getElementById("konto-plats") ?? null;
}

export function KontoMeny() {
  const navigate = useNavigate();
  const [plats, setPlats] = useState<HTMLElement | null>(null);
  const [pubOppen, setPubOppen] = useState(false);
  const [alltidGuide, setAlltidGuide] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_ALLTID_NYCKEL) === "ja";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let stoppad = false;
    const tick = () => {
      if (stoppad) return;
      const p = hittaPlats();
      setPlats((tidigare) => (tidigare === p ? tidigare : p));
    };
    tick();
    const id = window.setInterval(tick, 800);
    return () => {
      stoppad = true;
      window.clearInterval(id);
    };
  }, []);

  function vaxlaGuide() {
    const nytt = !alltidGuide;
    setAlltidGuide(nytt);
    try {
      localStorage.setItem(GUIDE_ALLTID_NYCKEL, nytt ? "ja" : "nej");
    } catch {
      /* strunt samma */
    }
  }

  return (
    <>
      {plats &&
        createPortal(
          <>
            <button type="button" className="knapp" onClick={() => setPubOppen(true)}>
              Publicera till styrelsen
            </button>
            <button
              type="button"
              className="knapp tyst"
              onClick={() => navigate({ to: "/styrelse" })}
            >
              Styrelsevy
            </button>
            <button type="button" className="knapp tyst" onClick={() => navigate({ to: "/mal" })}>
              Mål
            </button>
            <button
              type="button"
              className="knapp tyst"
              onClick={() => window.dispatchEvent(new Event(RUNDTUR_HANDELSE))}
            >
              Visa guiden
            </button>
            <button
              type="button"
              className="knapp tyst"
              aria-pressed={alltidGuide}
              onClick={vaxlaGuide}
              title="Starta guiden automatiskt varje gång appen öppnas"
            >
              Guide vid start: {alltidGuide ? "på" : "av"}
            </button>
          </>,
          plats,
        )}
      <Publicera oppen={pubOppen} onStang={() => setPubOppen(false)} />
    </>
  );
}
