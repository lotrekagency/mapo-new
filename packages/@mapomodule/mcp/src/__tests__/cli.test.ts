/**
 * End-to-end check of the stdio transport: spawns the published bin and talks
 * to it with a real MCP client. Skipped until the package is built.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

  it("advertises the docs tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "mapo_get_doc",
      "mapo_list_recipes",
      "mapo_search_docs",
    ]);
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
