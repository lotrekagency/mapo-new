import { describe, expect, it } from "vitest";
import { MAPO_INSTRUCTIONS } from "../runtime/core/instructions.js";
import { overviewSummary, renderOverview } from "../runtime/core/overview.js";
import { OVERVIEW_DOC, OVERVIEW_URI } from "../runtime/core/resources.js";
import { apiTools } from "../runtime/core/tools/api.js";
import { appTools } from "../runtime/core/tools/app.js";
import { backendTools } from "../runtime/core/tools/backend.js";
import { docsTools, listRecipesTool } from "../runtime/core/tools/docs.js";
import { scaffoldTools } from "../runtime/core/tools/scaffold.js";
import { makeContext, makeKnowledge } from "./fixtures.js";

const CONCEPTS_DOC = `# Concepts

How Mapo fits together.

## What Mapo is

Mapo is a set of Nuxt 4 modules for building admin interfaces.

The stack is Nuxt 4, Vue 3 and Nuxt UI.

You install one meta-package next to Nuxt UI, in this order:

\`\`\`ts
export default defineNuxtConfig({ modules: ["@nuxt/ui", "mapomodule"] });
\`\`\`

## The packages

Each package has one role.
`;

const withConcepts = () => makeKnowledge({ [OVERVIEW_DOC]: CONCEPTS_DOC });

describe("renderOverview", () => {
  it("serves the whole concepts page", () => {
    const text = renderOverview(withConcepts());
    expect(text).toContain("# Concepts");
    expect(text).toContain("## The packages");
  });

  it("points at the other tools when the page is not indexed", () => {
    const text = renderOverview(
      makeKnowledge({ "howto/x.md": "# X\n\nText." }),
    );
    expect(text).toContain(OVERVIEW_DOC);
    expect(text).toContain("mapo_list_recipes");
  });
});

describe("overviewSummary", () => {
  it("keeps the prose of the section and drops the code sample with its lead-in", () => {
    const summary = overviewSummary(withConcepts())!;
    expect(summary.startsWith("Mapo is a set of Nuxt 4 modules")).toBe(true);
    expect(summary).toContain("The stack is");
    expect(summary).not.toContain("defineNuxtConfig");
    expect(summary).not.toContain("in this order");
    expect(summary).toContain(OVERVIEW_URI);
  });

  it("is null when the page or the section is missing", () => {
    const otherSection = makeKnowledge({
      [OVERVIEW_DOC]: "# Concepts\n\n## Something else\n\nText.",
    });
    expect(overviewSummary(otherSection)).toBeNull();
    expect(overviewSummary(makeKnowledge({}))).toBeNull();
  });
});

describe("mapo_list_recipes without a task", () => {
  it("opens with the overview when the concepts page is indexed", async () => {
    const output = await listRecipesTool.run(
      {},
      makeContext({ [OVERVIEW_DOC]: CONCEPTS_DOC }),
    );
    expect(output.startsWith("Mapo is a set of Nuxt 4 modules")).toBe(true);
    expect(output).toContain("Mapo recipes:");
  });

  it("lists the recipes alone when the page is missing", async () => {
    const output = await listRecipesTool.run({}, makeContext());
    expect(output).toMatch(/^\d+ Mapo recipes:/);
  });
});

describe("server instructions", () => {
  const toolNames = [
    ...docsTools,
    ...apiTools,
    ...appTools,
    ...scaffoldTools,
    ...backendTools,
  ].map((tool) => tool.name);

  it("name only tools that exist", () => {
    const named = MAPO_INSTRUCTIONS.match(/\bmapo_[a-z_]+/g) ?? [];
    expect(named.length).toBeGreaterThan(5);
    for (const name of named) expect(toolNames, name).toContain(name);
  });

  it("point at the overview", () => {
    expect(MAPO_INSTRUCTIONS).toContain(OVERVIEW_URI);
    expect(MAPO_INSTRUCTIONS).toContain(OVERVIEW_DOC);
  });
});
