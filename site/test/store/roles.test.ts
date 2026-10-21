import { describe, expect, it } from "vitest";
import { canDesignate, homePathFor, isAdmin, isFederation, isReferee, isStaff, lockedCountry, roleLabelKey } from "@/lib/roles";
import { navGroups, navGroupsFor, navItemsFor } from "@/components/layout/nav-items";
import { dictionaries } from "@/locales";
import { lookup } from "@/lib/i18n/translate";

const admin = { role: "admin" as const, country: null };
const fed = { role: "federation" as const, country: "AAA" };
const ref = { role: "referee" as const, country: null };

describe("role helpers", () => {
  it("tell the three roles apart", () => {
    expect([isAdmin(admin), isAdmin(fed), isAdmin(ref), isAdmin(null)]).toEqual([true, false, false, false]);
    expect([isFederation(admin), isFederation(fed), isFederation(ref)]).toEqual([false, true, false]);
    expect([isReferee(admin), isReferee(fed), isReferee(ref)]).toEqual([false, false, true]);
    expect([isStaff(admin), isStaff(fed), isStaff(ref)]).toEqual([true, true, false]);
  });

  it("confine only a federation seat to a country", () => {
    expect(lockedCountry(fed)).toBe("AAA");
    expect(lockedCountry(admin)).toBeNull();
    expect(lockedCountry(null)).toBeNull();
  });

  it("send referees to their own space and staff to the product", () => {
    expect(homePathFor("referee")).toBe("/me");
    expect(homePathFor("admin")).toBe("/");
    expect(homePathFor("federation")).toBe("/");
  });

  it("have a translated label per role in every language", () => {
    for (const role of ["admin", "federation", "referee"] as const) {
      for (const dict of Object.values(dictionaries)) {
        expect(lookup(dict, roleLabelKey(role))).toBeTruthy();
      }
    }
  });
});

describe("canDesignate", () => {
  it("lets an admin designate anywhere, continental ties included", () => {
    expect(canDesignate(admin, "AAA")).toBe(true);
    expect(canDesignate(admin, "CAF")).toBe(true);
  });
  it("keeps a federation to its own country and off continental ties", () => {
    expect(canDesignate(fed, "AAA")).toBe(true);
    expect(canDesignate(fed, "BBB")).toBe(false);
    expect(canDesignate(fed, "CAF")).toBe(false);
  });
  it("never lets a referee or a signed-out visitor designate", () => {
    expect(canDesignate(ref, "AAA")).toBe(false);
    expect(canDesignate(null, "AAA")).toBe(false);
  });
});

describe("navigation per role", () => {
  const hrefs = (role: "admin" | "federation" | "referee" | null) => navItemsFor(role).map((i) => i.href);

  it("gives an admin the whole administration group", () => {
    expect(hrefs("admin")).toEqual(
      expect.arrayContaining(["/admin/accounts", "/admin/federations", "/admin/countries", "/admin/teams", "/admin/audit", "/federations"]),
    );
  });

  it("gives a federation only its own administration entries", () => {
    const h = hrefs("federation");
    expect(h).toEqual(expect.arrayContaining(["/admin/accounts", "/admin/teams", "/admin/audit"]));
    expect(h).not.toContain("/admin/federations");
    expect(h).not.toContain("/admin/countries");
    expect(h).not.toContain("/federations");
  });

  it("gives a referee or a signed-out visitor nothing", () => {
    expect(hrefs("referee")).toEqual([]);
    expect(hrefs(null)).toEqual([]);
  });

  it("drops groups that end up empty and keeps the overview first", () => {
    const groups = navGroupsFor("federation");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups[0].items[0].href).toBe("/");
    expect(navGroupsFor("admin").map((g) => g.labelKey)).toContain("nav.groupAdmin");
  });

  it("only uses translated labels, in all four languages", () => {
    for (const item of navGroups.flatMap((g) => g.items)) {
      for (const dict of Object.values(dictionaries)) expect(lookup(dict, item.labelKey), item.labelKey).toBeTruthy();
    }
    for (const group of navGroups) {
      for (const dict of Object.values(dictionaries)) expect(lookup(dict, group.labelKey), group.labelKey).toBeTruthy();
    }
  });
});
