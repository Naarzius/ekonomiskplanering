# Ekonomisk planering och scenarioanalys

Ett verktyg för flerårig ekonomisk planering i ett allmännyttigt bostadsbolag. Basplanen är
styrelsebudgeten; ovanpå den byggs scenarier för ränta, hyror, kostnader, investeringsvolym
och enskilda projekt. Resultat, kassaflöde, låneskuld och räntekostnad räknas om direkt, med
bryggor som förklarar skillnaden mellan två scenarier.

Appen körs helt i webbläsaren. Den behöver ingen server, ingen databas och inga nycklar.

**Underlaget i repot är syntetiskt.** Bolaget Demobostäder AB finns inte, och alla belopp,
projekt och adresser är påhittade. Byt ut `public/planering/data/underlag.js` mot det egna
bolagets siffror, se avsnittet Byta underlag.

## Funktioner

- Resultaträkning, investeringar, ränta och skuld, antaganden och jämförelse av scenarier,
  med tabeller och diagram per år över en rullande tioårshorisont.
- Scenarier som relativa avvikelser mot basplanen: ränteuppgång med genomslag efter
  bindning, drivare per kostnadsslag, investeringsvolym, projekt in och ut ur planen,
  nyproduktion med hyra och drift.
- Kombination av flera scenarier med redovisning av varje dels effekt och av fältkrockar.
- Snabbspakar, känslighetsanalys och gränsvärdessökning (vid vilken ränta bryts målet?).
- Inläsning av tertialprognos, investeringsspec eller sparat scenario (xlsx, csv, json)
  och export av hela modellen till Excel.
- Mål per nyckeltal med status inom, nära eller brutet.
- Styrelsevy med publicerade scenarier, mål och stresstester, utskrivbar till PDF.
- Guidad rundtur första gången appen öppnas.

## Kom igång

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # statiskt bygge i dist/
npm run preview    # provkör bygget
npm test           # enhetstester (vitest)
npm run typecheck  # tsc
npm run lint       # eslint + prettier
```

Bygget i `dist/` är rent statiskt och kan läggas på GitHub Pages, Netlify, Vercel eller en
vanlig webbserver. Sidorna `/styrelse` och `/mal` är klientrutter, så värden behöver skicka
okända adresser till `index.html` (på GitHub Pages: kopiera `index.html` till `404.html`).
Ligger appen under en undermapp, sätt `base` i `vite.config.ts`.

## Struktur

```
public/planering/        Själva planeringsappen. Ren JavaScript utan beroenden, kan öppnas
                         fristående genom att servera mappen.
  index.html             Layout och designsystem (färger i :root)
  app/modell.js          Räknemotorn: basplan, drivare, avskrivningstrappa, skuld och ränta
  app/ui.js              Gränssnittet: scenarier, flikar, dialoger, inläsning
  app/diagram.js         Diagram i ren SVG
  app/las-fil.js         Läser xlsx, csv och json i webbläsaren
  app/skriv-xlsx.js      Skriver xlsx i webbläsaren
  app/agent-api.js       Anropbart API mot motorn (utfall, jämför, förklara, känslighet, gräns)
  data/underlag.js       Underlaget: budget, drivare, finans, avskrivningar, projekt

src/                     React-lager runt planeringsappen (Vite, TanStack Router, Tailwind)
  routes/index.tsx       Planeringen i en iframe, med meny och guide ovanpå
  routes/styrelse.tsx    Styrelsevyn
  routes/mal.tsx         Mål per nyckeltal
  lib/styrning.ts        Lagring av mål och publicerade scenarier (localStorage)
  lib/motor.ts           Brygga till motorn i iframen, så att alla vyer räknar med samma kod
  lib/mal.ts             Bedömning mot mål och varningstexter
  lib/stress.ts          Färdiga stresstester
```

Räknemotorn finns på ett ställe, i `public/planering/app/modell.js`. React-lagret räknar
aldrig själv utan anropar motorn via `agent-api.js`. Publicerade scenarier sparas som frysta
indata och räknas om i motorn när styrelsevyn öppnas.

## Byta underlag

`public/planering/data/underlag.js` sätter `window.PLAN_UNDERLAG`. Alla belopp är i tkr,
intäkter positiva och kostnader negativa. Delarna:

| Del             | Innehåll                                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `meta`          | Bolag, källfiler, enhet och planerade år                                                                                                                                                                                                                                       |
| `rr`            | Resultaträkningens rader med `nyckel`, `etikett`, `niva` (post, delsumma, resultat) och `varden` per år. Nycklarna är de som `modell.js` förväntar sig (`RAD_DRIVARE` och `RR_STRUKTUR`). Motorn räknar själv delsummor, avskrivningar från 2027, räntekostnader och resultat. |
| `drivare`       | Arbetsbokens satser per år för hyreshöjningar, löner, taxor och administration                                                                                                                                                                                                 |
| `finans`        | Utgående och genomsnittlig låneskuld, snittränta, räntebindningstid, exponering mot rörlig ränta, antagen ränteuppgång, borgensavgift                                                                                                                                          |
| `avskrivning`   | Ingående planenlig avskrivning, ej aktiverat underhåll, satser per kategori, underhållsinvestering och projekt som aktiveras med år och belopp                                                                                                                                 |
| `andamal`       | Utfall per ändamål för fastighetskostnader och administration; andelarna delar upp blocken i komponenter med egna drivare                                                                                                                                                      |
| `investeringar` | Projektlista med utgift per år, summarad, koncernbidrag och bolagets finansieringskalkyl                                                                                                                                                                                       |

Enklast är att skriva ett skript som läser bolagets budget- och investeringsarbetsböcker
och skriver filen i samma form som demounderlaget. Dialogen Underlag och avstämning i appen
visar om motorn återger arbetsbokens rader exakt.

Färger och typsnitt sätts i `:root` i `public/planering/index.html` och i `src/styles.css`.
Typsnitt är systemets egna; inga fontfiler följer med.

## Vad som inte ingår

Den här versionen är rensad för att kunna delas öppet. Jämfört med den interna versionen
saknas:

- Inloggning och roller (controller respektive styrelse). Alla som öppnar appen kan
  modellera, publicera och ändra mål.
- Delad lagring. Mål och publicerade scenarier ligger i webbläsarens localStorage. Vill man
  dela styrelsevyn mellan flera personer byts funktionerna i `src/lib/styrning.ts` mot anrop
  till en databas; det är det enda stället som läser och skriver dessa data.
- Frågeagent. `agent-api.js` är kvar och är tänkt som verktygsyta för en språkmodell, men
  chattgränssnittet och serverkopplingen ingår inte.

## Licens

Ingen licens är satt ännu. Lägg till en LICENSE-fil innan repot görs publikt.
