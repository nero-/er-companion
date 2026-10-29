import { describe, expect, it } from "vitest";
import { ALL_SOFTCAP_STATS, SOFT_CAPS, softCapFor, softcapCount } from "./gameplay";
import { normalizeJourney } from "./store";
import { STAT_ORDER } from "./classes";

describe("soft cap reference", () => {
  it("maps every stat to a positive first soft cap", () => {
    expect(SOFT_CAPS.map((row) => row.key)).toEqual([...STAT_ORDER]);
    for (const row of SOFT_CAPS) {
      expect(row.cap).toBeGreaterThan(0);
      expect(softCapFor(row.key)).toBe(row.cap);
    }
  });

  it("builds a ceiling spread that reaches every cap", () => {
    expect(softcapCount(ALL_SOFTCAP_STATS)).toBe(STAT_ORDER.length);
    for (const row of SOFT_CAPS) {
      expect(ALL_SOFTCAP_STATS[row.key]).toBe(row.cap);
    }
  });
});

describe("journey normalization", () => {
  it("defaults the new per-journey ledgers on an older save", () => {
    const journey = normalizeJourney(
      {
        id: "journey-old",
        index: 1,
        label: "Journey 1",
        createdAt: "2026-01-01T00:00:00.000Z",
        steps: {},
      },
      1,
    );
    expect(journey.materialCounts).toEqual({});
    expect(journey.bossReveals).toEqual({});
    expect(journey.decisionChecks).toEqual({});
    expect(journey.worldChecks).toEqual({});
  });

  it("keeps valid recorded counts and drops invalid values", () => {
    const journey = normalizeJourney(
      {
        id: "journey-2",
        index: 2,
        materialCounts: { "MAT-A": 3, "MAT-B": -2, "MAT-C": "many" },
        bossReveals: { boss: true, other: false },
      },
      2,
    );
    expect(journey.materialCounts).toEqual({ "MAT-A": 3, "MAT-B": -2 });
    expect(journey.bossReveals).toEqual({ boss: true });
  });
});
