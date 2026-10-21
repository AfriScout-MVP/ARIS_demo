// The in-memory store ARIS draws from. Every collection starts empty and is filled by
// `applySnapshot` (see ./snapshot) from `GET /api/v1/snapshot`; there is no built-in data.

export * from "./types";
export * from "./dates";
export * from "./clock";
export * from "./geography";
export * from "./officials";
export * from "./fixtures";
export * from "./matches";
export * from "./assessments";
export * from "./analytics";
export * from "./links";
export { applySnapshot, normalizeFixture, resetStore } from "./snapshot";
