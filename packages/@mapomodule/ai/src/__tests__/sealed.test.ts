import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createStorage, prefixStorage } from "unstorage";
import fsLiteDriver from "unstorage/drivers/fs-lite";
import {
  MIN_SECRET_LENGTH,
  createSealedStorage,
  sweepExpired,
} from "../runtime/server/storage/sealed";
import type {
  KeyValueStorage,
  SealedStorageOptions,
  StoragePurpose,
  UnreadableReason,
} from "../runtime/server/storage/sealed";
import { isRecord } from "../runtime/shared/guards";

const SECRET = "test-secret-0123456789-abcdefghij-klmnop";
const OTHER_SECRET = "another-secret-0123456789-abcdefghij-klm";
const START = 1_800_000_000_000;

/** The mount as Nitro's `useStorage("mapo-ai")` gives it, in memory. */
function memoryMount(): KeyValueStorage {
  return prefixStorage(createStorage(), "mapo-ai");
}

/** A clock the test moves by hand. */
function clock(start = START): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms) };
}

/** A sealed storage on `storage`, with the problems it reports collected. */
function sealedOn(
  storage: KeyValueStorage,
  options: Partial<SealedStorageOptions> = {},
): {
  sealed: ReturnType<typeof createSealedStorage>;
  problems: Array<[string, UnreadableReason]>;
} {
  const problems: Array<[string, UnreadableReason]> = [];
  const sealed = createSealedStorage({
    storage,
    secret: SECRET,
    onUnreadable: (key, reason) => problems.push([key, reason]),
    ...options,
  });
  return { sealed, problems };
}

/** The validator a test uses when it only checks what comes back. */
const anything = (value: unknown): unknown => value;

/** Where the driver files the record at `path`, as `sealed.ts` names it. */
function recordAt(path: string): string {
  return `${path}.sealed`;
}

/** The envelope of the record at `path`, as a plain object the test may change. */
async function envelopeAt(
  storage: KeyValueStorage,
  path: string,
): Promise<Record<string, unknown>> {
  const stored = await storage.getItem(recordAt(path));
  if (!isRecord(stored)) throw new Error(`No envelope at ${path}`);
  return { ...stored };
}

describe("createSealedStorage", () => {
  it.each([
    ["a text", "Concerto di Natale"],
    ["text in other scripts", "Grüße, 東京, emoji 🎄, quotes “”"],
    ["an empty text", ""],
    ["a number", 12.5],
    ["zero", 0],
    ["a boolean", false],
    ["null", null],
    ["a list", [1, "two", { three: 3 }]],
    ["an empty list", []],
    [
      "a nested object",
      { title: "x", tags: ["a"], when: { day: "2026-12-24" } },
    ],
  ])("reads back %s as it was sealed", async (_label, value) => {
    const { sealed } = sealedOn(memoryMount());
    const store = sealed.store("settings");

    await store.set("general", value);

    expect(await store.get("general", anything)).toEqual(value);
  });

  it("keeps what JSON keeps: undefined properties drop out, dates become text", async () => {
    const { sealed } = sealedOn(memoryMount());
    const store = sealed.store("settings");

    await store.set("general", {
      kept: 1,
      dropped: undefined,
      when: new Date(Date.UTC(2026, 11, 24)),
    });

    expect(await store.get("general", anything)).toEqual({
      kept: 1,
      when: "2026-12-24T00:00:00.000Z",
    });
  });

  it.each([
    ["undefined", undefined],
    ["a function", () => 1],
    ["a symbol", Symbol("x")],
  ])("refuses %s, which has no JSON form", async (_label, value) => {
    const { sealed } = sealedOn(memoryMount());

    await expect(
      sealed.store("settings").set("general", value),
    ).rejects.toThrow(TypeError);
  });

  it("refuses a BigInt, as JSON does", async () => {
    const { sealed } = sealedOn(memoryMount());

    await expect(
      sealed.store("settings").set("general", { size: BigInt(1) }),
    ).rejects.toThrow(TypeError);
  });

  it(`refuses a secret shorter than ${MIN_SECRET_LENGTH} characters`, () => {
    expect(() =>
      createSealedStorage({ storage: memoryMount(), secret: "x".repeat(31) }),
    ).toThrow(TypeError);
    expect(() =>
      createSealedStorage({ storage: memoryMount(), secret: "x".repeat(32) }),
    ).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["with capitals", "Draft"],
    ["with a trailing colon", "draft:"],
    ["with a leading colon", ":draft"],
    ["with an empty segment", "a::b"],
    ["with a slash", "a/b"],
    ["going up", "..:secret"],
    ["with a space", "a b"],
    ["with an accent", "bozzà"],
    ["with a segment of 65 characters", "a".repeat(65)],
    ["with 9 segments", "a:b:c:d:e:f:g:h:i"],
    ["that Windows keeps for a device", "con"],
    ["with a device name further in", "b1:nul"],
    ["with a numbered device name", "com1"],
  ])("refuses a key %s", async (_label, key) => {
    const store = sealedOn(memoryMount()).sealed.store("staging");

    await expect(store.set(key, 1)).rejects.toThrow(TypeError);
    await expect(store.get(key, anything)).rejects.toThrow(TypeError);
    await expect(store.remove(key)).rejects.toThrow(TypeError);
  });

  it("accepts names that only begin like a device", async () => {
    const store = sealedOn(memoryMount()).sealed.store("staging");

    await store.set("console:nullable", 1);

    expect(await store.get("console:nullable", anything)).toBe(1);
  });

  it("accepts lowercase segments of up to 64 characters, up to 8 of them", async () => {
    const store = sealedOn(memoryMount()).sealed.store("staging");
    const key = ["a".repeat(64), "b_1", "c-2", "d", "e", "f", "g", "h"].join(
      ":",
    );

    await store.set(key, 1);

    expect(await store.get(key, anything)).toBe(1);
  });

  it("refuses a purpose that does not exist", () => {
    const { sealed } = sealedOn(memoryMount());
    const purpose: string = "drafts";

    // @ts-expect-error: a purpose outside STORAGE_PURPOSES
    expect(() => sealed.store(purpose)).toThrow(TypeError);
  });

  it("gives nothing for a key that holds nothing", async () => {
    const { sealed, problems } = sealedOn(memoryMount());

    expect(
      await sealed.store("tokens").get("missing", anything),
    ).toBeUndefined();
    expect(problems).toEqual([]);
  });

  it("passes the value through the caller's validator", async () => {
    const store = sealedOn(memoryMount()).sealed.store("settings");
    await store.set("general", { level: 3 });
    const readLevel = (value: unknown): number | undefined =>
      isRecord(value) && typeof value.level === "number"
        ? value.level
        : undefined;
    const readName = (value: unknown): string | undefined =>
      isRecord(value) && typeof value.name === "string"
        ? value.name
        : undefined;

    expect(await store.get("general", readLevel)).toBe(3);
    expect(await store.get("general", readName)).toBeUndefined();
  });

  it("replaces a value, and removes it", async () => {
    const store = sealedOn(memoryMount()).sealed.store("settings");

    await store.set("general", 1);
    await store.set("general", 2);
    expect(await store.get("general", anything)).toBe(2);

    await store.remove("general");
    expect(await store.get("general", anything)).toBeUndefined();
    await expect(store.remove("general")).resolves.toBeUndefined();
  });

  it("lists its keys, under a prefix by whole segments", async () => {
    const { sealed } = sealedOn(memoryMount());
    const staging = sealed.store("staging");
    await staging.set("b1", "batch");
    await staging.set("b1:d1", "draft");
    await staging.set("b1:d2", "draft");
    await staging.set("b10:d1", "draft");
    await sealed.store("settings").set("general", 1);

    expect((await staging.keys()).sort()).toEqual([
      "b1",
      "b10:d1",
      "b1:d1",
      "b1:d2",
    ]);
    expect((await staging.keys("b1")).sort()).toEqual(["b1:d1", "b1:d2"]);
    expect(await staging.keys("b2")).toEqual([]);
  });
});

describe("createSealedStorage — on the driver", () => {
  const folders: string[] = [];

  afterEach(async () => {
    await Promise.all(
      folders
        .splice(0)
        .map((folder) => rm(folder, { recursive: true, force: true })),
    );
  });

  it("stores an envelope: a key id, a nonce and the sealed value, nothing in clear", async () => {
    const storage = memoryMount();
    const { sealed } = sealedOn(storage);

    await sealed.store("settings").set("general", { note: "in-clear-marker" });

    const envelope = await envelopeAt(storage, "settings:general");
    expect(Object.keys(envelope).sort()).toEqual(["ct", "iv", "kid", "v"]);
    expect(envelope.v).toBe(1);
    expect(envelope.kid).toMatch(/^[0-9a-f]{16}$/);
    expect(envelope.iv).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(JSON.stringify(envelope)).not.toContain("in-clear-marker");
  });

  it("uses a new nonce for every write of the same value", async () => {
    const storage = memoryMount();
    const store = sealedOn(storage).sealed.store("settings");

    await store.set("general", "same");
    const first = await envelopeAt(storage, "settings:general");
    await store.set("general", "same");
    const second = await envelopeAt(storage, "settings:general");

    expect(second.iv).not.toBe(first.iv);
    expect(second.ct).not.toBe(first.ct);
  });

  it("keeps a record and the records under it apart, on disk too", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mapo-ai-"));
    folders.push(folder);
    const storage = prefixStorage(
      createStorage({ driver: fsLiteDriver({ base: folder }) }),
      "mapo-ai",
    );
    const staging = sealedOn(storage).sealed.store("staging");

    await staging.set("b1", "batch");
    await staging.set("b1:d1", "draft 1");
    await staging.set("b1:d2", "draft 2");
    await staging.set("b10:d1", "another batch's draft");
    await staging.set("b2:d1", "a draft before its batch");
    await staging.set("b2", "its batch");

    expect(await staging.get("b1", anything)).toBe("batch");
    expect(await staging.get("b1:d1", anything)).toBe("draft 1");
    expect(await staging.get("b2", anything)).toBe("its batch");
    expect(await staging.get("b2:d1", anything)).toBe(
      "a draft before its batch",
    );
    expect((await staging.keys()).sort()).toEqual([
      "b1",
      "b10:d1",
      "b1:d1",
      "b1:d2",
      "b2",
      "b2:d1",
    ]);
    expect((await staging.keys("b1")).sort()).toEqual(["b1:d1", "b1:d2"]);

    await staging.remove("b1");
    expect(await staging.get("b1", anything)).toBeUndefined();
    expect(await staging.get("b1:d1", anything)).toBe("draft 1");
  });

  it("keeps the users' spaces apart from the purpose's own records, on disk too", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mapo-ai-"));
    folders.push(folder);
    const storage = prefixStorage(
      createStorage({ driver: fsLiteDriver({ base: folder }) }),
      "mapo-ai",
    );
    const tokens = sealedOn(storage).sealed.store("tokens");

    await tokens.set("users", "a purpose's own record");
    await (await tokens.forUser("anna")).set("openai", "anna's");

    expect(await tokens.get("users", anything)).toBe("a purpose's own record");
    expect(await (await tokens.forUser("anna")).get("openai", anything)).toBe(
      "anna's",
    );
  });

  it("leaves no value and no user id readable on disk", async () => {
    const folder = await mkdtemp(join(tmpdir(), "mapo-ai-"));
    folders.push(folder);
    const storage = prefixStorage(
      createStorage({ driver: fsLiteDriver({ base: folder }) }),
      "mapo-ai",
    );
    const { sealed } = sealedOn(storage);
    const tokens = sealed.store("tokens");
    const mine = await tokens.forUser("mario.rossi@example.com");

    await mine.set("openai", { token: "sk-in-clear-marker", last4: "9876" });
    await sealed
      .store("settings")
      .set("general", { note: "Concerto di Natale" });

    const files = (
      await readdir(folder, { recursive: true, withFileTypes: true })
    )
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
    expect(files).toHaveLength(2);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      expect(text).not.toContain("sk-in-clear-marker");
      expect(text).not.toContain("9876");
      expect(text).not.toContain("Concerto");
      expect(text).not.toContain("mario");
      expect(file).not.toContain("mario");
    }
    expect(await mine.get("openai", anything)).toEqual({
      token: "sk-in-clear-marker",
      last4: "9876",
    });
  });
});

describe("createSealedStorage — bound to its place", () => {
  it("does not open a record copied to another key, and leaves it there", async () => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage);
    const store = sealed.store("keys");
    await store.set("team-a", { key: "a" });

    await storage.setItem(
      recordAt("keys:team-b"),
      await envelopeAt(storage, "keys:team-a"),
    );

    expect(await store.get("team-b", anything)).toBeUndefined();
    expect(problems).toEqual([["keys:team-b", "tampered"]]);
    expect(await storage.getItem(recordAt("keys:team-b"))).not.toBeNull();
  });

  it("does not open a record copied from one user to another", async () => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage);
    const tokens = sealed.store("tokens");
    const anna = await tokens.forUser("anna");
    const bruno = await tokens.forUser("bruno");
    await anna.set("openai", { token: "anna's" });
    const [annaKey] = await tokens.keys();
    await bruno.set("openai", { token: "bruno's" });
    const [brunoKey] = (await tokens.keys()).filter((key) => key !== annaKey);

    await storage.setItem(
      recordAt(`tokens:${brunoKey}`),
      await envelopeAt(storage, `tokens:${annaKey}`),
    );

    expect(await bruno.get("openai", anything)).toBeUndefined();
    expect(problems).toEqual([[`tokens:${brunoKey}`, "tampered"]]);
    expect(await anna.get("openai", anything)).toEqual({ token: "anna's" });
  });

  it("does not open a record of another purpose", async () => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage);
    await sealed.store("tokens").set("shared", { token: "t" });

    await storage.setItem(
      recordAt("keys:shared"),
      await envelopeAt(storage, "tokens:shared"),
    );

    expect(await sealed.store("keys").get("shared", anything)).toBeUndefined();
    expect(problems).toEqual([["keys:shared", "other-key"]]);
  });

  it("does not open a record sealed with another secret, and never removes it", async () => {
    const storage = memoryMount();
    await sealedOn(storage, { secret: OTHER_SECRET })
      .sealed.store("keys")
      .set("team-a", 1);
    const { sealed, problems } = sealedOn(storage);

    expect(await sealed.store("keys").get("team-a", anything)).toBeUndefined();
    expect(problems).toEqual([["keys:team-a", "other-key"]]);
    expect(await storage.getItem(recordAt("keys:team-a"))).not.toBeNull();
    expect(
      await sealedOn(storage, { secret: OTHER_SECRET })
        .sealed.store("keys")
        .get("team-a", anything),
    ).toBe(1);
  });

  it("says a record is there without opening it, one sealed with another secret too", async () => {
    const storage = memoryMount();
    await sealedOn(storage, { secret: OTHER_SECRET })
      .sealed.store("keys")
      .set("team-a", 1);
    const { sealed, problems } = sealedOn(storage);

    expect(await sealed.store("keys").has("team-a")).toBe(true);
    expect(await sealed.store("keys").has("team-b")).toBe(false);
    expect(problems).toEqual([]);
  });

  it.each([
    [
      "a byte of the sealed value",
      (envelope: Record<string, unknown>) => ({
        ...envelope,
        ct: flip(String(envelope.ct)),
      }),
    ],
    [
      "the nonce",
      (envelope: Record<string, unknown>) => ({
        ...envelope,
        iv: flip(String(envelope.iv)),
      }),
    ],
    [
      "a nonce of the wrong length",
      (envelope: Record<string, unknown>) => ({ ...envelope, iv: "AAAA" }),
    ],
    [
      "a sealed value too short for its tag",
      (envelope: Record<string, unknown>) => ({ ...envelope, ct: "AAAA" }),
    ],
  ])("does not open a record with %s changed", async (_label, change) => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage);
    await sealed.store("settings").set("general", { level: 1 });

    await storage.setItem(
      recordAt("settings:general"),
      change(await envelopeAt(storage, "settings:general")),
    );

    expect(
      await sealed.store("settings").get("general", anything),
    ).toBeUndefined();
    expect(problems).toEqual([["settings:general", "tampered"]]);
  });

  it("does not open a record whose expiry was moved later", async () => {
    const storage = memoryMount();
    const time = clock();
    const { sealed, problems } = sealedOn(storage, { now: time.now });
    const store = sealed.store("staging");
    await store.set("b1", "batch", { expiresAt: START + 1000 });

    const envelope = await envelopeAt(storage, "staging:b1");
    await storage.setItem(recordAt("staging:b1"), {
      ...envelope,
      exp: START + 1_000_000,
    });
    time.advance(5000);

    expect(await store.get("b1", anything)).toBeUndefined();
    expect(problems).toEqual([["staging:b1", "tampered"]]);
  });

  it("does not open a record that lost its expiry", async () => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage, { now: clock().now });
    const store = sealed.store("staging");
    await store.set("b1", "batch", { expiresAt: START + 1000 });

    const { exp: _dropped, ...envelope } = await envelopeAt(
      storage,
      "staging:b1",
    );
    await storage.setItem(recordAt("staging:b1"), envelope);

    expect(await store.get("b1", anything)).toBeUndefined();
    expect(problems).toEqual([["staging:b1", "tampered"]]);
  });

  it.each([
    ["a text", "hello"],
    ["a number", 42],
    ["an object of another shape", { v: 1, data: "x" }],
    [
      "an envelope of another version",
      { v: 2, kid: "00", iv: "AAAA", ct: "AAAA" },
    ],
    [
      "an envelope with one key more",
      { v: 1, kid: "00", iv: "AAAA", ct: "AAAA", by: "x" },
    ],
    [
      "an envelope whose expiry is not a time",
      { v: 1, kid: "00", iv: "AAAA", ct: "AAAA", exp: "soon" },
    ],
  ])("calls %s foreign, and leaves it", async (_label, value) => {
    const storage = memoryMount();
    const { sealed, problems } = sealedOn(storage);

    await storage.setItem(recordAt("settings:general"), value);

    expect(
      await sealed.store("settings").get("general", anything),
    ).toBeUndefined();
    expect(problems).toEqual([["settings:general", "foreign"]]);
    expect(await storage.getItem(recordAt("settings:general"))).not.toBeNull();
  });
});

describe("createSealedStorage — expiry", () => {
  it("never returns an expired record, and removes it when it meets it", async () => {
    const storage = memoryMount();
    const time = clock();
    const { sealed } = sealedOn(storage, { now: time.now });
    const store = sealed.store("staging");
    await store.set("b1", "batch", { expiresAt: START + 1000 });

    time.advance(999);
    expect(await store.get("b1", anything)).toBe("batch");

    time.advance(1);
    expect(await store.get("b1", anything)).toBeUndefined();
    expect(await storage.getItem(recordAt("staging:b1"))).toBeNull();
  });

  it.each([
    ["now", START],
    ["in the past", START - 1],
    ["a fraction of a millisecond", START + 1000.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("refuses an expiry %s", async (_label, expiresAt) => {
    const store = sealedOn(memoryMount(), { now: clock().now }).sealed.store(
      "staging",
    );

    await expect(store.set("b1", 1, { expiresAt })).rejects.toThrow(RangeError);
  });

  it("writes the expiry in clear, and gives the driver its own expiry in seconds", async () => {
    const writes: Array<{ key: string; options: unknown }> = [];
    const inner = memoryMount();
    const storage: KeyValueStorage = {
      getItem: (key) => inner.getItem(key),
      removeItem: (key) => inner.removeItem(key),
      getKeys: (base) => inner.getKeys(base),
      setItem: (key, value, options) => {
        writes.push({ key, options });
        return inner.setItem(key, value, options);
      },
    };
    const { sealed } = sealedOn(storage, { now: clock().now });

    await sealed
      .store("staging")
      .set("b1", "batch", { expiresAt: START + 90_500 });
    await sealed.store("settings").set("general", 1);

    expect(writes).toEqual([
      { key: "staging:b1.sealed", options: { ttl: 91 } },
      { key: "settings:general.sealed", options: undefined },
    ]);
    expect((await envelopeAt(inner, "staging:b1")).exp).toBe(START + 90_500);
    expect(await envelopeAt(inner, "settings:general")).not.toHaveProperty(
      "exp",
    );
  });
});

describe("createSealedStorage — users", () => {
  it("keeps two users' records apart under the same key", async () => {
    const tokens = sealedOn(memoryMount()).sealed.store("tokens");
    const anna = await tokens.forUser("anna");
    const bruno = await tokens.forUser("bruno");

    await anna.set("openai", "anna's");
    await bruno.set("openai", "bruno's");

    expect(await anna.get("openai", anything)).toBe("anna's");
    expect(await bruno.get("openai", anything)).toBe("bruno's");
    expect(await tokens.get("openai", anything)).toBeUndefined();
  });

  it("names a user by a keyed hash: never the id, the same for one secret and purpose", async () => {
    /** The space a fresh storage gives the user, as its key shows it. */
    const spaceOf = async (
      secret: string,
      purpose: StoragePurpose,
    ): Promise<string> => {
      const store = createSealedStorage({
        storage: memoryMount(),
        secret,
      }).store(purpose);
      await (await store.forUser("anna@example.com")).set("x", 1);
      const [key] = await store.keys();
      return key.split(":").slice(0, 2).join(":");
    };

    const space = await spaceOf(SECRET, "tokens");

    expect(space).toMatch(/^u:[0-9a-f]{32}$/);
    expect(space).not.toContain("anna");
    expect(await spaceOf(SECRET, "tokens")).toBe(space);
    expect(await spaceOf(OTHER_SECRET, "tokens")).not.toBe(space);
    expect(await spaceOf(SECRET, "staging")).not.toBe(space);
  });

  it("lists every user's records from the purpose, and each user's own", async () => {
    const tokens = sealedOn(memoryMount()).sealed.store("tokens");
    const anna = await tokens.forUser("anna");
    const bruno = await tokens.forUser("bruno");
    await anna.set("openai", 1);
    await anna.set("anthropic", 2);
    await bruno.set("openai", 3);

    expect((await anna.keys()).sort()).toEqual(["anthropic", "openai"]);
    expect(await bruno.keys()).toEqual(["openai"]);
    const all = await tokens.keys();
    expect(all).toHaveLength(3);
    for (const key of all)
      expect(key).toMatch(/^u:[0-9a-f]{32}:(openai|anthropic)$/);
    const [first] = all;
    expect(await tokens.get(first, anything)).toBeTypeOf("number");
  });

  it("writes in a user's space only through forUser, and reads and removes there from the purpose", async () => {
    const tokens = sealedOn(memoryMount()).sealed.store("tokens");
    const anna = await tokens.forUser("anna");
    await anna.set("openai", "anna's");
    const [key] = await tokens.keys();

    await expect(tokens.set(key, "forged")).rejects.toThrow(TypeError);
    await expect(tokens.set("u", 1)).rejects.toThrow(TypeError);
    await expect(tokens.set("u:anything", 1)).rejects.toThrow(TypeError);
    expect(await anna.get("openai", anything)).toBe("anna's");
    expect(await tokens.get(key, anything)).toBe("anna's");

    await tokens.remove(key);
    expect(await anna.get("openai", anything)).toBeUndefined();
  });

  it("refuses an empty user id", async () => {
    const tokens = sealedOn(memoryMount()).sealed.store("tokens");

    await expect(tokens.forUser("")).rejects.toThrow(TypeError);
  });
});

describe("sweepExpired", () => {
  it("removes the expired records of every purpose and user, and nothing else", async () => {
    const storage = memoryMount();
    const time = clock();
    const { sealed } = sealedOn(storage, { now: time.now });
    const staging = sealed.store("staging");
    const anna = await sealed.store("tokens").forUser("anna");
    await staging.set("old", 1, { expiresAt: START + 1000 });
    await staging.set("fresh", 2, { expiresAt: START + 10_000 });
    await anna.set("old", 3, { expiresAt: START + 1000 });
    await sealed.store("settings").set("forever", 4);
    await storage.setItem("settings:foreign", { exp: START });
    await storage.setItem(recordAt("settings:newer"), {
      v: 2,
      kid: "00",
      iv: "AAAA",
      ct: "AAAA",
      exp: START,
    });

    const result = await sweepExpired(storage, START + 5000);

    expect(result).toEqual({ removed: 2, failed: 0 });
    expect((await storage.getKeys()).sort()).toEqual([
      "settings:foreign",
      "settings:forever.sealed",
      "settings:newer.sealed",
      "staging:fresh.sealed",
    ]);
  });

  it("needs no secret: it reads only the expiry", async () => {
    const storage = memoryMount();
    const { sealed } = sealedOn(storage, {
      secret: OTHER_SECRET,
      now: clock().now,
    });
    await sealed.store("staging").set("old", 1, { expiresAt: START + 1000 });

    expect(await sweepExpired(storage, START + 1000)).toEqual({
      removed: 1,
      failed: 0,
    });
    expect(await storage.getKeys()).toEqual([]);
  });

  it("counts a record it cannot check, and goes on with the others", async () => {
    const inner = memoryMount();
    const { sealed } = sealedOn(inner, { now: clock().now });
    await sealed.store("staging").set("a", 1, { expiresAt: START + 1000 });
    await sealed.store("staging").set("b", 2, { expiresAt: START + 1000 });
    const storage: KeyValueStorage = {
      getKeys: (base) => inner.getKeys(base),
      setItem: (key, value, options) => inner.setItem(key, value, options),
      removeItem: (key) => inner.removeItem(key),
      getItem: (key) =>
        key === "staging:a.sealed"
          ? Promise.reject(new Error("disk"))
          : inner.getItem(key),
    };

    expect(await sweepExpired(storage, START + 1000)).toEqual({
      removed: 1,
      failed: 1,
    });
    expect(await inner.getKeys()).toEqual(["staging:a.sealed"]);
  });
});

describe("createSealedStorage — what was stored stays readable", () => {
  // Known answers for one secret. If one of these changes, every record
  // already stored stops opening, and every user moves to a new space.
  const KNOWN_SECRET = "known-answer-secret-0123456789-abcdefgh";

  it("derives the same key id and the same user space as before", async () => {
    const storage = memoryMount();
    const sealed = createSealedStorage({ storage, secret: KNOWN_SECRET });

    await sealed.store("settings").set("general", 1);
    const tokens = sealed.store("tokens");
    await (await tokens.forUser("anna@example.com")).set("openai", 1);

    expect((await envelopeAt(storage, "settings:general")).kid).toBe(
      "ac7e3c142c18f307",
    );
    expect(await tokens.keys()).toEqual([
      "u:6d20cee6fd5a65bd0b83e66310798f39:openai",
    ]);
  });

  it("opens a record sealed by the first version of the format", async () => {
    const storage = memoryMount();
    await storage.setItem(recordAt("staging:b1"), {
      v: 1,
      kid: "82d934fdd2d784e3",
      iv: "9qYjOuytFuUKeKA5",
      ct: "cr7qQf6qN51y5825AyLYPvy6oAv6j9eNn48bXBGyw0SnfjXhKRlyID0QKp5pkwAGW-ofxt2X",
      exp: 4_102_444_800_000,
    });
    const { sealed, problems } = sealedOn(storage, {
      secret: KNOWN_SECRET,
      now: () => START,
    });

    expect(await sealed.store("staging").get("b1", anything)).toEqual({
      note: "sealed by the first version",
    });
    expect(problems).toEqual([]);
  });
});

/** `text` with its first character changed, in the same alphabet. */
function flip(text: string): string {
  const first = text[0] === "A" ? "B" : "A";
  return first + text.slice(1);
}
