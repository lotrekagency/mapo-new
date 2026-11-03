import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addDefaultStorageMount } from "../storage";
import type { StorageMountOptions } from "../storage";

/** Nitro's resolved options, as far as the default mount reads them. */
function options(
  overrides: Partial<StorageMountOptions> = {},
): StorageMountOptions {
  return {
    dev: false,
    node: true,
    rootDir: "/srv/app",
    storage: {},
    devStorage: {},
    ...overrides,
  };
}

describe("addDefaultStorageMount", () => {
  it("leaves the mount the app chose for every run, in development and on the server", () => {
    for (const dev of [true, false]) {
      const redis = { driver: "redis", url: "redis://x" };
      const nitro = options({ dev, storage: { "mapo-ai": redis } });

      expect(addDefaultStorageMount(nitro)).toBe("app");
      expect(nitro.storage).toEqual({ "mapo-ai": redis });
      expect(nitro.devStorage).toEqual({});
    }
  });

  it("leaves a mount for development alone, and still mounts the file system on the server, as Nitro does", () => {
    const memory = { driver: "memory" };
    const development = options({
      dev: true,
      devStorage: { "mapo-ai": memory },
    });
    const server = options({ devStorage: { "mapo-ai": memory } });

    expect(addDefaultStorageMount(development)).toBe("app");
    expect(development.storage).toEqual({});
    expect(addDefaultStorageMount(server)).toBe("node-server");
    expect(server.storage["mapo-ai"]).toEqual({
      driver: "fsLite",
      base: "./.data/mapo-ai",
    });
    expect(server.devStorage).toEqual({ "mapo-ai": memory });
  });

  it("mounts .data/mapo-ai in the app's root in development", () => {
    const nitro = options({ dev: true });

    expect(addDefaultStorageMount(nitro)).toBe("development");
    expect(nitro.devStorage["mapo-ai"]).toEqual({
      driver: "fs",
      base: resolve("/srv/app", ".data", "mapo-ai"),
    });
    expect(nitro.storage).toEqual({});
  });

  it("mounts ./.data/mapo-ai from the working directory on a Node server", () => {
    const nitro = options();

    expect(addDefaultStorageMount(nitro)).toBe("node-server");
    expect(nitro.storage["mapo-ai"]).toEqual({
      driver: "fsLite",
      base: "./.data/mapo-ai",
    });
    expect(nitro.devStorage).toEqual({});
  });

  it("mounts nothing on a preset without a file system", () => {
    const nitro = options({ node: false });

    expect(addDefaultStorageMount(nitro)).toBe("none");
    expect(nitro.storage).toEqual({});
    expect(nitro.devStorage).toEqual({});
  });

  it("leaves the app's other mounts alone", () => {
    const data = { driver: "fsLite", base: "./.data/kv" };
    const nitro = options({ storage: { data } });

    addDefaultStorageMount(nitro);

    expect(nitro.storage.data).toBe(data);
    expect(Object.keys(nitro.storage).sort()).toEqual(["data", "mapo-ai"]);
  });
});
