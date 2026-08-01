/**
 * End-to-end check of the stdio transport: spawns the published bin and talks
 * to it with a real MCP client. Skipped until the package is built.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** `contents` is a text/blob union; every resource this server serves is text. */
interface TextResourceContent {
  uri: string;
  text: string;
  mimeType?: string;
}

const binPath = fileURLToPath(
  new URL("../../bin/mapo-mcp.mjs", import.meta.url),
);
const cliBuilt = existsSync(
  fileURLToPath(new URL("../../dist/cli.mjs", import.meta.url)),
);
const describeBuilt = cliBuilt ? describe : describe.skip;

describeBuilt("mapo-mcp stdio server", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: "mapo-mcp-test", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({ command: process.execPath, args: [binPath] }),
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  it("advertises every tool that works without the dev server", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "mapo_component_api",
      "mapo_composable_api",
      "mapo_get_doc",
      "mapo_list_field_types",
      "mapo_list_recipes",
      "mapo_search_docs",
    ]);
  });

  it("exposes the knowledge resources, including the templated ones", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain("mapo://knowledge/index");
    expect(uris.some((uri) => uri.startsWith("mapo://docs/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("mapo://fields/"))).toBe(true);
  });

  it("reads a documentation page through its resource URI", async () => {
    const result = await client.readResource({
      uri: "mapo://docs/howto/crud-list.md",
    });
    const content = result.contents[0] as TextResourceContent;

    expect(content.mimeType).toBe("text/markdown");
    expect(content.text).toContain("MapoList");
  });

  it("reads a field type contract through its resource URI", async () => {
    const result = await client.readResource({ uri: "mapo://fields/select" });
    const content = result.contents[0] as TextResourceContent;

    expect(content.text).toContain("Field type `select`");
  });

  it("answers a docs search", async () => {
    const result = (await client.callTool({
      name: "mapo_search_docs",
      arguments: { query: "CRUD list pagination", limit: 2 },
    })) as { content: Array<{ text: string }>; isError?: boolean };

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("howto/");
  });

  it("reports invalid input instead of crashing", async () => {
    const result = (await client
      .callTool({
        name: "mapo_get_doc",
        arguments: { path: "does-not-exist.md" },
      })
      .catch((error: Error) => ({ content: [{ text: error.message }] }))) as {
      content: Array<{ text: string }>;
    };

    expect(result.content[0]!.text).toContain("mapo_search_docs");
  });
});
