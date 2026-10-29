import { describe, expect, it } from "vitest";
import { plainCopy, remembrancePlanRows } from "./remembrance";

describe("remembrance copy", () => {
  it("strips codes", () => {
    expect(plainCopy("Journey 1 — take X. Duplication: J1 DUP-10 — Foo")).not.toMatch(/DUP-/);
  });
  it("rows have no codes", () => {
    const rows = remembrancePlanRows();
    for (const row of rows) {
      expect(row.journey1).not.toMatch(/DUP-\d/);
      expect(row.journey2).not.toMatch(/DUP-\d/);
      expect(row.duplicateDetail).not.toMatch(/DUP-\d/);
    }
  });
});
