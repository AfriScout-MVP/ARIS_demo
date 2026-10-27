import { describe, expect, it } from "vitest";
import { emptyConflict, toConflictBody, validateConflict } from "@/lib/officials/conflicts";

describe("conflicts of interest", () => {
  it("needs a name for a club or team and a country code for a country", () => {
    expect(validateConflict({ ...emptyConflict(), subject: "ASC Jaraaf" }, [])).toEqual({});
    expect(validateConflict({ ...emptyConflict(), subject: "J" }, []).subject).toBe("officials.conflicts.errors.subject");
    expect(validateConflict({ kind: "country", subject: "Senegal", note: "" }, []).subject).toBe("officials.conflicts.errors.country");
    expect(validateConflict({ kind: "country", subject: "sen", note: "" }, [])).toEqual({});
    expect(validateConflict({ kind: "team", subject: "Lions", note: "x".repeat(301) }, []).note).toBe("officials.conflicts.errors.note");
  });
  it("spots a link already declared, whatever the case", () => {
    const existing = [{ kind: "club", subject: "ASC Jaraaf" }, { kind: "country", subject: "SEN" }];
    expect(validateConflict({ kind: "club", subject: "asc jaraaf ", note: "" }, existing).subject).toBe("officials.conflicts.errors.duplicate");
    expect(validateConflict({ kind: "team", subject: "ASC Jaraaf", note: "" }, existing)).toEqual({});
    expect(validateConflict({ kind: "country", subject: "sen", note: "" }, existing).subject).toBe("officials.conflicts.errors.duplicate");
  });
  it("sends the code in capitals and drops an empty note", () => {
    expect(toConflictBody({ kind: "country", subject: " gmb ", note: " " })).toEqual({ kind: "country", subject: "GMB" });
    expect(toConflictBody({ kind: "club", subject: " Génération Foot ", note: "Joueur 2015-2019" })).toEqual({ kind: "club", subject: "Génération Foot", note: "Joueur 2015-2019" });
  });
});
