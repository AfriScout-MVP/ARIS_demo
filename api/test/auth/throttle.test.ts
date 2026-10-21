import { describe, expect, it } from "vitest";
import { addUser, api, PASSWORD, uid } from "../helpers";

describe("login throttle", () => {
  it("locks an account after five failures, even for the right password", async () => {
    const email = `${uid("t")}@aris.test`;
    await addUser(email, "admin");
    for (let i = 0; i < 5; i++) expect((await api("POST", "/api/v1/auth/login", { body: { email, password: "wrong-wrong-wrong" } })).status).toBe(401);
    const blocked = await api("POST", "/api/v1/auth/login", { body: { email, password: PASSWORD } });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("too_many_attempts");
    expect(blocked.headers.get("retry-after")).toBe("900");
  });
});
