/** Färdiga stresstester, uttryckta i räknemotorns scenarioformat. */

export type Stresspaket = {
  id: string;
  namn: string;
  beskrivning: string;
  scenario: Record<string, unknown>;
};

const FRAN = 2027;

const RANTA = { ranta: { uppgang: 0.02, fran: FRAN, genomslag: "bindning" } };
const HYRA = { drivare: { hyra_bostader: { fran: FRAN, varde: 0.01 } } };
const KOSTNAD = {
  drivare: {
    entreprenad: { fran: FRAN, varde: 0.06 },
    underhall: { fran: FRAN, varde: 0.06 },
    varme: { fran: FRAN, varde: 0.08 },
    el: { fran: FRAN, varde: 0.08 },
  },
};

export const STRESSPAKET: Stresspaket[] = [
  {
    id: "ranta",
    namn: "Räntechock",
    beskrivning: "Räntan 2 procentenheter högre från 2027, slår igenom i takt med bindningen.",
    scenario: { namn: "Räntechock", ...RANTA },
  },
  {
    id: "hyra",
    namn: "Låg hyresutveckling",
    beskrivning: "Hyrorna för bostäder höjs bara 1 % per år från 2027.",
    scenario: { namn: "Låg hyresutveckling", ...HYRA },
  },
  {
    id: "kostnad",
    namn: "Höga kostnader",
    beskrivning: "Entreprenad och underhåll +6 %, värme och el +8 % per år från 2027.",
    scenario: { namn: "Höga kostnader", ...KOSTNAD },
  },
  {
    id: "allt",
    namn: "Allt på en gång",
    beskrivning: "Räntechock, låg hyresutveckling och höga kostnader samtidigt.",
    scenario: {
      namn: "Allt på en gång",
      ...RANTA,
      drivare: { ...HYRA.drivare, ...KOSTNAD.drivare },
    },
  },
];
