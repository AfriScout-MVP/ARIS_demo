import { beforeEach, describe, expect, it } from "vitest";
import { applySnapshot } from "@/lib/store";
import { ask } from "@/lib/copilot";
import { country, snapshot } from "../store/fixtures";

// The federations comparison is admin-only; a federation seat's answers must never point there.
describe("copilot links", () => {
  beforeEach(() => {
    applySnapshot(snapshot({ countries: [country("AAA", "UNAF", { syncHealth: "stale" })] }));
  });

  const hrefs = (admin: boolean) => {
    const answer = ask("sync", "en", ["AAA"], admin);
    expect(answer).not.toBeNull();
    return [answer!.sourceHref, ...answer!.rows.map((r) => r.href)];
  };

  it("link admins to the federations comparison", () => {
    expect(hrefs(true)).toContain("/federations");
  });

  it("keep federation seats away from it", () => {
    expect(hrefs(false)).not.toContain("/federations");
    expect(ask("zone UNAF", "en", ["AAA"])?.sourceHref).not.toBe("/federations");
  });
});
