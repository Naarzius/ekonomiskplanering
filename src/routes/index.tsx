import { createFileRoute } from "@tanstack/react-router";
import { KontoMeny } from "@/components/KontoMeny";
import { Rundtur } from "@/components/Rundtur";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ekonomisk planering och scenarioanalys" },
      {
        name: "description",
        content:
          "Ekonomisk planering och scenarioanalys: resultat, investeringar, låneskuld och räntebana.",
      },
    ],
  }),
  component: Planering,
});

/* Planeringsvyn är en fristående app i public/planering som visas i en
 * iframe. React-lagret lägger menyn, guiden och publiceringen ovanpå. */
function Planering() {
  return (
    <>
      <iframe
        src="/planering/index.html"
        title="Ekonomisk planering och scenarioanalys"
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: 0 }}
      />
      <KontoMeny />
      <Rundtur />
    </>
  );
}
