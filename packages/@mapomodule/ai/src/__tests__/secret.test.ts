import { describe, expect, it } from "vitest";
import { createStorage } from "unstorage";
import {
  MIN_SECRET_LENGTH,
  createSealedStorage,
} from "../runtime/server/storage/sealed";
import {
  canSeal,
  readMapoAiSecret,
  secretNotice,
} from "../runtime/server/storage/secret";

const SECRET = "0123456789abcdefghijklmnopqrstuvwxyz-secret";

describe("readMapoAiSecret", () => {
  it("takes the app's secret, trimmed", () => {
    expect(readMapoAiSecret(SECRET, { dev: false })).toEqual({
      status: "set",
      secret: SECRET,
    });
    expect(readMapoAiSecret(`  ${SECRET}\n`, { dev: true })).toEqual({
      status: "set",
      secret: SECRET,
    });
  });

  it.each([
    ["not set", undefined],
    ["null", null],
    ["empty", ""],
    ["only spaces", "   \n"],
  ])(
    "closes the storage in production when the secret is %s",
    (_label, value) => {
      expect(readMapoAiSecret(value, { dev: false })).toEqual({
        status: "missing",
      });
    },
  );

  it.each([
    ["not set", undefined],
    ["empty", ""],
  ])(
    "makes a temporary secret in development when the secret is %s",
    (_label, value) => {
      const first = readMapoAiSecret(value, { dev: true });
      const second = readMapoAiSecret(value, { dev: true });

      expect(first.status).toBe("temporary");
      if (!canSeal(first) || !canSeal(second))
        throw new Error("No secret made");
      expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(second.secret).not.toBe(first.secret);
    },
  );

  it.each([true, false])(
    "closes the storage when the secret is too short, in development too (dev: %s)",
    (dev) => {
      const short = "x".repeat(MIN_SECRET_LENGTH - 1);

      expect(readMapoAiSecret(short, { dev })).toEqual({ status: "too-short" });
      expect(
        readMapoAiSecret("x".repeat(MIN_SECRET_LENGTH), { dev }).status,
      ).toBe("set");
    },
  );

  it.each([
    ["a number", 20261103],
    ["a boolean", true],
    ["an object", { value: SECRET }],
    ["a list", [SECRET]],
  ])(
    "closes the storage when the environment turned the secret into %s",
    (_label, value) => {
      expect(readMapoAiSecret(value, { dev: true })).toEqual({
        status: "not-text",
      });
      expect(readMapoAiSecret(value, { dev: false })).toEqual({
        status: "not-text",
      });
    },
  );

  it("gives a temporary secret a sealed storage can use", async () => {
    const secret = readMapoAiSecret(undefined, { dev: true });
    if (!canSeal(secret)) throw new Error("No secret made");
    const store = createSealedStorage({
      storage: createStorage(),
      secret: secret.secret,
    }).store("settings");

    await store.set("general", { level: 1 });

    expect(await store.get("general", (value) => value)).toEqual({ level: 1 });
  });
});

describe("canSeal", () => {
  it("seals with the app's secret or a temporary one, and with nothing else", () => {
    expect(canSeal({ status: "set", secret: SECRET })).toBe(true);
    expect(canSeal({ status: "temporary", secret: SECRET })).toBe(true);
    expect(canSeal({ status: "missing" })).toBe(false);
    expect(canSeal({ status: "too-short" })).toBe(false);
    expect(canSeal({ status: "not-text" })).toBe(false);
  });
});

describe("secretNotice", () => {
  it("says nothing when the app's own secret is set", () => {
    expect(secretNotice({ status: "set", secret: SECRET })).toBeUndefined();
  });

  it("warns that a temporary secret loses the state at restart, without printing it", () => {
    const notice = secretNotice({ status: "temporary", secret: SECRET });

    expect(notice?.level).toBe("warn");
    expect(notice?.message).toContain("NUXT_MAPO_AI_SECRET");
    expect(notice?.message).toContain("lost when it restarts");
    expect(notice?.message).not.toContain(SECRET);
  });

  it.each(["missing", "too-short", "not-text"] as const)(
    "is an error that names the closed storage when the secret is %s",
    (status) => {
      const notice = secretNotice({ status });

      expect(notice?.level).toBe("error");
      expect(notice?.message).toContain("NUXT_MAPO_AI_SECRET");
      expect(notice?.message).toContain("the AI storage is closed");
      expect(notice?.message).toContain("openssl rand -base64 32");
    },
  );
});
