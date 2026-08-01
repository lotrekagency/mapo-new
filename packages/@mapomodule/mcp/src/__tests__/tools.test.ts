import { describe, expect, it } from "vitest";
import {
  apiTools,
  componentApiTool,
  composableApiTool,
  fieldTypesTool,
} from "../runtime/core/tools/api.js";
import {
  docsTools,
  getDocTool,
  searchDocsTool,
} from "../runtime/core/tools/docs.js";
import { makeContext } from "./fixtures.js";

const context = makeContext();
const allTools = [...docsTools, ...apiTools];

describe("tool specs", () => {
  it("namespaces every tool and declares read-only annotations", () => {
    for (const tool of allTools) {
      expect(tool.name.startsWith("mapo_")).toBe(true);
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it("exposes input examples that satisfy the declared schema", () => {
    for (const tool of allTools) {
      for (const example of tool.inputExamples ?? []) {
        for (const key of Object.keys(example)) {
          expect(Object.keys(tool.inputSchema)).toContain(key);
        }
      }
    }
  });
});

describe("mapo_search_docs", () => {
  it("returns paths and anchors the agent can feed to mapo_get_doc", async () => {
    const output = await searchDocsTool.run(
      { query: "bulk actions", limit: 2 },
      context,
    );
    expect(output).toContain("howto/crud-list.md");
    expect(output).toContain("#bulk-actions");
    expect(output).toContain("mapo_get_doc");
  });

  it("explains the miss instead of returning an empty result", async () => {
    const output = await searchDocsTool.run({ query: "zzzqqq" }, context);
    expect(output).toContain("No documentation section matched");
  });
});

describe("mapo_get_doc", () => {
  it("returns the section plus the page's heading list", async () => {
    const output = await getDocTool.run(
      { path: "howto/crud-list.md", heading: "Minimal example" },
      context,
    );
    expect(output).toContain("source: `howto/crud-list.md`");
    expect(output).toContain("MapoList");
    expect(output).toContain("Bulk actions");
  });

  it("points back to search when the path is wrong", async () => {
    const output = await getDocTool.run({ path: "nope.md" }, context);
    expect(output).toContain("mapo_search_docs");
  });
});

describe("mapo_component_api", () => {
  it("renders props, events and slots with their real types", async () => {
    const output = await componentApiTool.run({ name: "MapoList" }, context);
    expect(output).toContain("# MapoList");
    expect(output).toContain("`endpoint`: `string` **required**");
    expect(output).toContain("(default `[]`)");
    expect(output).toContain("**Events** (1)");
    expect(output).toContain("uikit/list.md#mapolist");
  });

  it("resolves partial names, with or without the Mapo prefix", async () => {
    const output = await componentApiTool.run({ name: "detail" }, context);
    expect(output).toContain("# MapoDetail");
  });

  it("limits the response to the requested sections", async () => {
    const output = await componentApiTool.run(
      { name: "MapoList", include: ["slots"] },
      context,
    );
    expect(output).toContain("**Slots**");
    expect(output).not.toContain("**Props**");
  });

  it("lists what exists when the name is unknown", async () => {
    const output = await componentApiTool.run({ name: "MapoNope" }, context);
    expect(output).toContain("No Mapo component matches");
    expect(output).toContain("MapoList");
  });
});

describe("mapo_list_field_types", () => {
  it("lists every registered type with its component", async () => {
    const output = await fieldTypesTool.run({}, context);
    expect(output).toContain("`select` → NuiSelectMenu");
    expect(output).toContain("`text` → NuiInput");
    expect(output).toContain("Shared descriptor properties");
  });

  it("details one type with attrs, defaults and a skeleton descriptor", async () => {
    const output = await fieldTypesTool.run({ type: "select" }, context);
    expect(output).toContain("# Field type `select`");
    expect(output).toContain("descriptor: `SelectDescriptor`");
    expect(output).toContain('registry defaults: `{"labelKey":"text"}`');
    expect(output).toContain('type: "select"');
    expect(output).toContain("attrs: { items: … }");
    expect(output).toContain("`items`: `readonly string[]` **required**");
  });

  it("points at defineFormField for unknown types", async () => {
    const output = await fieldTypesTool.run({ type: "nope" }, context);
    expect(output).toContain("defineFormField");
    expect(output).toContain("select, text");
  });
});

describe("mapo_composable_api", () => {
  it("groups the auto-imported composables by package", async () => {
    const output = await composableApiTool.run({}, context);
    expect(output).toContain("**@mapomodule/core**: useCrud");
    expect(output).toContain("**@mapomodule/uikit**: useMediaStore");
  });

  it("returns the real signature for one composable", async () => {
    const output = await composableApiTool.run({ name: "useCrud" }, context);
    expect(output).toContain(
      "useCrud: <T>(endpoint: string) => CrudRepository<T>",
    );
    expect(output).toContain("auto-imported");
  });

  it("reports unknown names without inventing an API", async () => {
    const output = await composableApiTool.run({ name: "useNope" }, context);
    expect(output).toContain("No auto-imported composable matches");
  });
});
