import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEvent, isError } from "h3";
import type { H3Event } from "h3";
import { createStorage, prefixStorage } from "unstorage";
import type { Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createSealedStorage } from "../runtime/server/storage/sealed";

const SECRET = "nitro-test-secret-0123456789-abcdefghijkl";
const OTHER_SECRET = "nitro-other-secret-0123456789-abcdefghijk";

/** What the mocked `nitropack/runtime` serves, and the events it was asked with. */
const runtime = vi.hoisted(() => {
  const state: {
    root: Storage | undefined;
    config: Record<string, unknown>;
    events: unknown[];
  } = { root: undefined, config: {}, events: [] };
  return state;
});

vi.mock("nitropack/runtime", async () => {
  const { prefixStorage: prefix } = await import("unstorage");
  const root = (): Storage => {
    if (!runtime.root) throw new Error("No root storage in this test");
    return runtime.root;
  };
  return {
    useRuntimeConfig: (event?: unknown) => {
      runtime.events.push(event);
      return runtime.config;
    },
    useStorage: (base = "") => (base ? prefix(root(), base) : root()),
  };
});

/** A fresh copy of the wiring, with its caches empty. */
function wiring(): Promise<typeof import("../runtime/server/storage/nitro")> {
  return import("../runtime/server/storage/nitro");
}

/** A request's event, as a route receives it. */
function anEvent(): H3Event {
  const request = new IncomingMessage(new Socket());
  return createEvent(request, new ServerResponse(request));
}

/** The status code `run` fails with, or `undefined` when it does not fail. */
function failureOf(run: () => unknown): number | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return isError(error) ? error.statusCode : -1;
  }
}

function mountedRoot(): Storage {
  const root = createStorage();
  root.mount("mapo-ai", memoryDriver());
  return root;
}

beforeEach(() => {
  vi.resetModules();
  runtime.root = undefined;
  runtime.config = { mapoAi: { secret: SECRET } };
  runtime.events = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMapoAiStorage", () => {
  it.each([
    ["not set", {}],
    ["empty", { secret: "" }],
    ["too short", { secret: "short" }],
    ["not text", { secret: 20261103 }],
  ])(
    "fails with a 503 in production when the secret is %s",
    async (_label, mapoAi) => {
      runtime.root = mountedRoot();
      runtime.config = { mapoAi };
      const { useMapoAiStorage } = await wiring();

      expect(failureOf(() => useMapoAiStorage(anEvent()))).toBe(503);
    },
  );

  it("fails with a 503 when nothing is mounted, and leaves Nitro's memory alone", async () => {
    runtime.root = createStorage();
    const { useMapoAiStorage } = await wiring();

    expect(failureOf(() => useMapoAiStorage(anEvent()))).toBe(503);
    expect(await runtime.root.getKeys()).toEqual([]);
  });

  it("opens with a secret and a mount, and reads back what it sealed", async () => {
    runtime.root = mountedRoot();
    const { useMapoAiStorage } = await wiring();

    const settings = useMapoAiStorage(anEvent()).store("settings");
    await settings.set("general", { level: 2 });

    expect(await settings.get("general", (value) => value)).toEqual({
      level: 2,
    });
    expect(await runtime.root.getKeys()).toEqual([
      "mapo-ai:settings:general.sealed",
    ]);
  });

  it("closes again when the mount goes away", async () => {
    runtime.root = mountedRoot();
    const { useMapoAiStorage } = await wiring();
    expect(failureOf(() => useMapoAiStorage(anEvent()))).toBeUndefined();

    await runtime.root.unmount("mapo-ai");

    expect(failureOf(() => useMapoAiStorage(anEvent()))).toBe(503);
  });

  it("reads the secret through the request's event", async () => {
    runtime.root = mountedRoot();
    const { useMapoAiStorage } = await wiring();
    const event = anEvent();

    useMapoAiStorage(event);

    expect(runtime.events).toContain(event);
  });

  it("follows the secret of the runtime config, not the first one it read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    runtime.root = mountedRoot();
    runtime.config = { mapoAi: {} };
    const { useMapoAiStorage } = await wiring();
    expect(failureOf(() => useMapoAiStorage(anEvent()))).toBe(503);

    runtime.config = { mapoAi: { secret: SECRET } };
    await useMapoAiStorage(anEvent()).store("settings").set("general", 1);
    runtime.config = { mapoAi: { secret: OTHER_SECRET } };

    expect(
      await useMapoAiStorage(anEvent())
        .store("settings")
        .get("general", (value) => value),
    ).toBeUndefined();
  });

  it("warns once per record, and names no more than a hundred records", async () => {
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    runtime.root = mountedRoot();
    const other = createSealedStorage({
      storage: prefixStorage(runtime.root, "mapo-ai"),
      secret: OTHER_SECRET,
    }).store("staging");
    for (let index = 0; index < 105; index += 1) {
      await other.set(`b${index}`, index);
    }
    const { useMapoAiStorage } = await wiring();
    const staging = useMapoAiStorage(anEvent()).store("staging");

    await staging.get("b0", (value) => value);
    await staging.get("b0", (value) => value);
    expect(warnings).toHaveBeenCalledTimes(1);
    expect(String(warnings.mock.calls[0]?.[0])).toContain(
      "sealed with another secret, or for another purpose",
    );

    for (let index = 1; index < 105; index += 1) {
      await staging.get(`b${index}`, (value) => value);
    }
    expect(warnings).toHaveBeenCalledTimes(101);
    expect(String(warnings.mock.calls[100]?.[0])).toContain(
      "More than 100 records cannot be read",
    );
  });
});
