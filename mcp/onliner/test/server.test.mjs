import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("exposes the guarded Onliner MCP workflow", async (context) => {
  const serverPath = fileURLToPath(new URL("../src/server.mjs", import.meta.url));
  const stateDirectory = await mkdtemp(path.join(os.tmpdir(), "onliner-mcp-test-"));
  context.after(() => rm(stateDirectory, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    stderr: "pipe",
    env: {
      ...process.env,
      ONLINER_STATE_DIR: stateDirectory,
    },
  });
  const client = new Client({ name: "onliner-test", version: "0.1.0" });
  try {
    await client.connect(transport);
    const response = await client.listTools();
    const names = response.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "onliner_auth_status",
      "onliner_find_categories",
      "onliner_find_regions",
      "onliner_preview_listing",
      "onliner_publish_listing",
      "onliner_start_login",
    ]);
    const publish = response.tools.find((tool) => tool.name === "onliner_publish_listing");
    assert.equal(publish.annotations.destructiveHint, true);
    assert.equal(publish.annotations.readOnlyHint, false);
    const denied = await client.callTool({
      name: "onliner_publish_listing",
      arguments: {
        approval_id: "missing-approval",
        confirmation: "PUBLISH APPROVED LISTING",
      },
    });
    assert.equal(denied.structuredContent.status, "заблокировано");
    assert.equal(denied.structuredContent.blocker, "approval_id не найден");
  } finally {
    await client.close();
  }
});
