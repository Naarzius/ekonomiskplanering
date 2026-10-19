import { describe, expect, it } from "vitest";
import { bedom, varningar, type Mal } from "./mal";
import { STRESSPAKET } from "./stress";

const rtg: Mal = {
  matt: "rantetackningsgrad",
  etikett: "Räntetäckningsgrad",
  riktning: "minst",
  grans: 1.5,
  marginal: 0.3,
  enhet: "ggr",
  exempel: true,
};
const skuld: Mal = {
  ...rtg,
  matt: "laneskuld_ub",
  etikett: "Låneskuld",
  riktning: "hogst",
  grans: 11500,
  marginal: 300,
};

describe("mål", () => {
  it("under en minst-gräns är brutet", () => expect(bedom(1.4, rtg)).toBe("brutet"));
  it("inom marginalen är nära", () => expect(bedom(1.7, rtg)).toBe("nara"));
  it("precis på gränsen är nära, inte brutet", () => expect(bedom(1.5, rtg)).toBe("nara"));
  it("långt över är inom", () => expect(bedom(2.5, rtg)).toBe("inom"));
  it("över en högst-gräns är brutet", () => expect(bedom(11600, skuld)).toBe("brutet"));
  it("varnar för första året målet bryts", () =>
    expect(
      varningar(
        { rantetackningsgrad: { 2027: 1.8, 2028: 1.4, 2029: 1.2 } },
        [rtg],
        [2027, 2028, 2029],
      ),
    ).toEqual(["Räntetäckningsgrad understiger målet 2028."]));
});

describe("stresstester", () => {
  it("räntechocken är 2 procentenheter från 2027", () =>
    expect(STRESSPAKET[0]!.scenario["ranta"]).toEqual({
      uppgang: 0.02,
      fran: 2027,
      genomslag: "bindning",
    }));
  it("allt på en gång innehåller både ränta, hyra och kostnader", () => {
    const allt = STRESSPAKET.find((p) => p.id === "allt")!.scenario as {
      ranta: unknown;
      drivare: Record<string, unknown>;
    };
    expect(allt.ranta).toBeDefined();
    expect(Object.keys(allt.drivare)).toEqual(
      expect.arrayContaining(["hyra_bostader", "entreprenad", "varme"]),
    );
  });
});
