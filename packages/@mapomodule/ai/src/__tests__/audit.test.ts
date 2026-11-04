import { describe, expect, it } from "vitest";
import { createStorage } from "unstorage";
import {
  AUDIT_RECORD_VERSION,
  auditKey,
  readAuditRecord,
  writeAudit,
} from "../runtime/server/run/audit";
import type { MapoAiAuditRecord } from "../runtime/server/run/audit";
import { createSealedStorage } from "../runtime/server/storage/sealed";

const SECRET = "audit-test-secret-0123456789-abcdefghijk";

const RECORD: MapoAiAuditRecord = {
  v: AUDIT_RECORD_VERSION,
  at: "2026-11-04T10:15:30.123Z",
  user: { id: "2", username: "editor" },
  task: "fill",
  entities: [
    { label: "Article", endpoint: "/api/articles/", model: "article" },
  ],
  provider: { id: "mock", model: "mock" },
  prompt: 1,
  usage: { inputTokens: 120, outputTokens: 30 },
  outcome: "answered",
  durationMs: 12,
};

describe("auditKey", () => {
  it("files a call under its day, with its time and a random tail", () => {
    const key = auditKey(Date.UTC(2026, 10, 4, 10, 15, 30, 123));

    expect(key).toMatch(/^2026:11:04:t101530123-[0-9a-f]{8}$/);
  });

  it("gives two calls of the same millisecond two keys", () => {
    const at = Date.UTC(2026, 10, 4);

    expect(auditKey(at)).not.toBe(auditKey(at));
  });
});

describe("readAuditRecord", () => {
  it("reads a record this version writes", () => {
    expect(readAuditRecord(structuredClone(RECORD))).toEqual(RECORD);
    expect(
      readAuditRecord({ ...RECORD, outcome: "failed", failure: "timeout" }),
    ).toMatchObject({ failure: "timeout" });
  });

  it.each([
    ["of another version", { ...RECORD, v: 2 }],
    ["with a key this version does not write", { ...RECORD, source: "text" }],
    [
      "with tokens that are no count",
      { ...RECORD, usage: { inputTokens: -1, outputTokens: 0 } },
    ],
    ["with an outcome that does not exist", { ...RECORD, outcome: "maybe" }],
    ["that is no object", "a record"],
  ])("refuses a record %s", (_case, value) => {
    expect(readAuditRecord(value)).toBeUndefined();
  });
});

describe("writeAudit", () => {
  it("seals the record in its user's space, to expire after the retention", async () => {
    const storage = createStorage();
    const sealed = createSealedStorage({ storage, secret: SECRET });
    const now = Date.UTC(2026, 10, 4, 10, 0, 0);

    await writeAudit(sealed.store("audit"), RECORD, {
      at: now,
      retentionDays: 30,
      now,
    });

    const [name = ""] = await storage.getKeys();
    expect(name).toMatch(
      /^audit:u:[0-9a-f]+:2026:11:04:t100000000-[0-9a-f]{8}\.sealed$/,
    );
    expect(await storage.getItem(name)).toMatchObject({
      exp: now + 30 * 24 * 60 * 60 * 1000,
    });
    const space = await sealed.store("audit").forUser("2");
    const [key = ""] = await space.keys();
    expect(await space.get(key, readAuditRecord)).toEqual(RECORD);
    expect(JSON.stringify(await storage.getItem(name))).not.toContain("editor");
  });
});
