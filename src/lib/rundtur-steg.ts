export type RundturSteg = {
  /** CSS-väljare inne i planeringsvyns iframe */
  iframeMal?: string;
  /** CSS-väljare i React-lagret (samma dokument) */
  sidMal?: string;
  rubrik: string;
  text: string;
};

export const RUNDTUR_STEG: RundturSteg[] = [
  {
    rubrik: "Välkommen",
    text: "Här ligger bolagets ekonomiska planering för de kommande åren. Du kan bygga scenarier, jämföra dem, sätta mål och publicera till styrelsevyn. Guiden tar en minut.",
  },
  {
    iframeMal: "#scenariolista",
    rubrik: "Dina scenarier",
    text: "Alla scenarier ligger här. Basplanen överst, dina egna under. Klicka på ett för att öppna det.",
  },
  {
    iframeMal: "#knapp-nytt",
    rubrik: "Nytt scenario",
    text: "Skapa ett eget scenario från grunden. Du väljer ränta, volym, investeringar och projekt.",
  },
  {
    iframeMal: "#knapp-redigera",
    rubrik: "Redigera, duplicera, ta bort",
    text: "Ändra ett scenario, kopiera det som utgångspunkt för ett nytt, eller rensa bort det du inte behöver.",
  },
  {
    iframeMal: "#jamforval",
    rubrik: "Jämför med",
    text: "Välj vad scenariot ska ställas mot. Då visas skillnaden i varje tabell och diagram.",
  },
  {
    iframeMal: "#snabbspakar",
    rubrik: "Snabbspakar",
    text: "Vrid direkt på de största antagandena och se resultatet räknas om på en gång.",
  },
  {
    iframeMal: "#arval",
    rubrik: "År och nyckeltal",
    text: "Välj år högst upp. Nyckeltalen intill visar resultat, investeringar, låneskuld och räntebana för det året.",
  },
  {
    iframeMal: "#flikar",
    rubrik: "Tabeller och diagram",
    text: "Flikarna visar samma plan på olika sätt: resultat, kassaflöde, skuld och känslighet.",
  },
  {
    iframeMal: "#knapp-prognos",
    rubrik: "Läs in och exportera",
    text: "Läs in en tertialprognos eller ett sparat scenario, och ta ut hela modellen som Excel.",
  },
  {
    iframeMal: "#konto-plats",
    rubrik: "Styrelsevy och mål",
    text: "Publicera det scenario du står i till styrelsevyn, sätt mål per nyckeltal och se stresstester av basplanen.",
  },
];
