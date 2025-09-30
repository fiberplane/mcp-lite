/** biome-ignore-all lint/complexity/useLiteralKeys: testing a private property */

import { describe, expect, it } from "bun:test";
import { METHODS } from "../../src/constants.js";
import { McpServer } from "../../src/core.js";
import type { MCPServerContext, ToolCallResult } from "../../src/types.js";

// NOTE: These tests access private methods using bracket notation (e.g., parent["handleToolsList"])
// This is intentional white-box testing to verify internal behavior without requiring full HTTP
// transport setup. This pattern allows us to test the core functionality directly while maintaining
// proper encapsulation in the public API.

describe("McpServer.group()", () => {
  describe("Namespacing", () => {
    it("should namespace tools with prefix", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "clone",
        {
          description: "Clone a repository",
          handler: () => ({
            content: [{ type: "text", text: "cloned" }],
          }),
        },
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group("git", child);

      const toolsList = await parent["handleToolsList"](
        {},
        {} as MCPServerContext,
      );
      expect(toolsList.tools).toHaveLength(1);
      expect(toolsList.tools[0]?.name).toBe("git/clone");
    });

    it("should namespace prompts with prefix", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).prompt(
        "commitMessage",
        {
          description: "Generate commit message",
          handler: () => ({
            messages: [
              {
                role: "user",
                content: { type: "text", text: "Generate a commit message" },
              },
            ],
          }),
        },
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group("git", child);

      const promptsList = await parent["handlePromptsList"](
        {},
        {} as MCPServerContext,
      );
      expect(promptsList.prompts).toHaveLength(1);
      expect(promptsList.prompts[0]?.name).toBe("git/commitMessage");
    });

    it("should not namespace resources", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).resource(
        "file://{path}",
        { description: "Read a file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "file content" }],
        }),
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group("fs", child);

      const templatesList = await parent["handleResourceTemplatesList"](
        {},
        {} as MCPServerContext,
      );
      expect(templatesList.resourceTemplates).toHaveLength(1);
      expect(templatesList.resourceTemplates[0]?.uriTemplate).toBe(
        "file://{path}",
      );
    });

    it("should namespace tools with suffix", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "generateText",
        {
          handler: () => ({ content: [{ type: "text", text: "generated" }] }),
        },
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group({ suffix: "claude" }, child);

      const toolsList = await parent["handleToolsList"](
        {},
        {} as MCPServerContext,
      );
      expect(toolsList.tools).toHaveLength(1);
      expect(toolsList.tools[0]?.name).toBe("generateText_claude");
    });

    it("should namespace tools with both prefix and suffix", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "generateText",
        {
          handler: () => ({ content: [{ type: "text", text: "generated" }] }),
        },
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group({ prefix: "ai", suffix: "claude" }, child);

      const toolsList = await parent["handleToolsList"](
        {},
        {} as MCPServerContext,
      );
      expect(toolsList.tools).toHaveLength(1);
      expect(toolsList.tools[0]?.name).toBe("ai/generateText_claude");
    });

    it("should mount flat without prefix", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "echo",
        {
          handler: (args: { message: string }) => ({
            content: [{ type: "text", text: args.message }],
          }),
        },
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group(child);

      const toolsList = await parent["handleToolsList"](
        {},
        {} as MCPServerContext,
      );
      expect(toolsList.tools).toHaveLength(1);
      expect(toolsList.tools[0]?.name).toBe("echo");
    });
  });

  describe("Keep-First Semantics", () => {
    it("should keep first tool and skip duplicate", async () => {
      const parent = new McpServer({ name: "parent", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({
            content: [{ type: "text", text: "v1" }],
          }),
        },
      );

      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({
            content: [{ type: "text", text: "v2" }],
          }),
        },
      );

      parent.group(child);

      const result = await parent["handleToolsCall"](
        { name: "clone", arguments: {} },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      expect((result as ToolCallResult).content[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect((result as ToolCallResult).content[0]?.text).toBe("v1");
    });

    it("should handle duplicate after namespacing", async () => {
      const child1 = new McpServer({ name: "child1", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({
            content: [{ type: "text", text: "child1" }],
          }),
        },
      );

      const child2 = new McpServer({ name: "child2", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({
            content: [{ type: "text", text: "child2" }],
          }),
        },
      );

      const parent = new McpServer({ name: "parent", version: "1.0.0" })
        .group("git", child1)
        .group("git", child2);

      const result = await parent["handleToolsCall"](
        { name: "git/clone", arguments: {} },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      expect((result as ToolCallResult).content[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect((result as ToolCallResult).content[0]?.text).toBe("child1");
    });

    it("should skip duplicate resource templates", async () => {
      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).resource(
        "file://{path}",
        { description: "Parent file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "parent" }],
        }),
      );

      const child = new McpServer({ name: "child", version: "1.0.0" }).resource(
        "file://{path}",
        { description: "Child file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "child" }],
        }),
      );

      parent.group(child);

      const result = await parent["handleResourcesRead"](
        { uri: "file://test.txt" },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      // @ts-expect-error - type is not present on BlobResourceContents
      expect(result.contents[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect(result.contents[0]?.text).toBe("parent");
    });

    it("should warn when skipping duplicate tools", () => {
      const warnings: string[] = [];
      const customLogger = {
        error: () => {},
        warn: (msg: string) => warnings.push(msg),
        info: () => {},
        debug: () => {},
      };

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
        logger: customLogger,
      }).tool("clone", {
        handler: () => ({ content: [{ type: "text", text: "parent" }] }),
      });

      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({ content: [{ type: "text", text: "child" }] }),
        },
      );

      parent.group(child);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Tool 'clone' already exists");
      expect(warnings[0]).toContain("keep-first semantics");
    });

    it("should warn when skipping duplicate prompts", () => {
      const warnings: string[] = [];
      const customLogger = {
        error: () => {},
        warn: (msg: string) => warnings.push(msg),
        info: () => {},
        debug: () => {},
      };

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
        logger: customLogger,
      }).prompt("test", {
        handler: () => ({
          messages: [
            { role: "user", content: { type: "text", text: "parent" } },
          ],
        }),
      });

      const child = new McpServer({ name: "child", version: "1.0.0" }).prompt(
        "test",
        {
          handler: () => ({
            messages: [
              { role: "user", content: { type: "text", text: "child" } },
            ],
          }),
        },
      );

      parent.group(child);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Prompt 'test' already exists");
      expect(warnings[0]).toContain("keep-first semantics");
    });

    it("should warn when skipping duplicate resources", () => {
      const warnings: string[] = [];
      const customLogger = {
        error: () => {},
        warn: (msg: string) => warnings.push(msg),
        info: () => {},
        debug: () => {},
      };

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
        logger: customLogger,
      }).resource(
        "file://{path}",
        { description: "Parent file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "parent" }],
        }),
      );

      const child = new McpServer({ name: "child", version: "1.0.0" }).resource(
        "file://{path}",
        { description: "Child file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "child" }],
        }),
      );

      parent.group(child);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("Resource 'file://{path}' already exists");
      expect(warnings[0]).toContain("keep-first semantics");
    });
  });

  describe("Middleware Composition", () => {
    it("should execute parent and child middlewares in correct order", async () => {
      const log: string[] = [];

      const parent = new McpServer({ name: "parent", version: "1.0.0" }).use(
        async (_ctx, next) => {
          log.push("parent-pre");
          await next();
          log.push("parent-post");
        },
      );

      const child = new McpServer({ name: "child", version: "1.0.0" })
        .use(async (_ctx, next) => {
          log.push("child-pre");
          await next();
          log.push("child-post");
        })
        .tool("test", {
          handler: () => {
            log.push("handler");
            return { content: [{ type: "text", text: "ok" }] };
          },
        });

      parent.group(child);

      await parent._dispatch({
        jsonrpc: "2.0",
        id: "1",
        method: METHODS.TOOLS.CALL,
        params: { name: "test", arguments: {} },
      });

      expect(log).toEqual([
        "parent-pre",
        "child-pre",
        "handler",
        "child-post",
        "parent-post",
      ]);
    });

    it("should execute child middlewares for child tools only", async () => {
      const log: string[] = [];

      const parent = new McpServer({ name: "parent", version: "1.0.0" })
        .use(async (_ctx, next) => {
          log.push("parent-pre");
          await next();
          log.push("parent-post");
        })
        .tool("parentTool", {
          handler: () => {
            log.push("parent-handler");
            return { content: [{ type: "text", text: "parent" }] };
          },
        });

      const child = new McpServer({ name: "child", version: "1.0.0" })
        .use(async (_ctx, next) => {
          log.push("child-pre");
          await next();
          log.push("child-post");
        })
        .tool("childTool", {
          handler: () => {
            log.push("child-handler");
            return { content: [{ type: "text", text: "child" }] };
          },
        });

      parent.group(child);

      await parent._dispatch({
        jsonrpc: "2.0",
        id: "1",
        method: METHODS.TOOLS.CALL,
        params: { name: "parentTool", arguments: {} },
      });

      expect(log).toEqual(["parent-pre", "parent-handler", "parent-post"]);

      log.length = 0;

      await parent._dispatch({
        jsonrpc: "2.0",
        id: "2",
        method: METHODS.TOOLS.CALL,
        params: { name: "childTool", arguments: {} },
      });

      expect(log).toEqual([
        "parent-pre",
        "child-pre",
        "child-handler",
        "child-post",
        "parent-post",
      ]);
    });
  });

  describe("Resource Preservation", () => {
    it("should preserve static resource URIs", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).resource(
        "file://config.json",
        { description: "Config file" },
        async (uri) => ({
          contents: [
            {
              uri: uri.href,
              type: "text",
              text: '{"key":"value"}',
              mimeType: "application/json",
            },
          ],
        }),
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group(child);

      const resourcesList = await parent["handleResourcesList"](
        {},
        {} as MCPServerContext,
      );
      expect(resourcesList.resources).toHaveLength(1);
      expect(resourcesList.resources[0]?.uri).toBe("file://config.json");
    });

    it("should preserve template resources and matchers", async () => {
      const child = new McpServer({ name: "child", version: "1.0.0" }).resource(
        "github://repos/{owner}/{repo}",
        { description: "GitHub repo" },
        async (uri, vars) => ({
          contents: [
            { uri: uri.href, type: "text", text: `${vars.owner}/${vars.repo}` },
          ],
        }),
      );

      const parent = new McpServer({
        name: "parent",
        version: "1.0.0",
      }).group(child);

      const templatesList = await parent["handleResourceTemplatesList"](
        {},
        {} as MCPServerContext,
      );
      expect(templatesList.resourceTemplates).toHaveLength(1);
      expect(templatesList.resourceTemplates[0]?.uriTemplate).toBe(
        "github://repos/{owner}/{repo}",
      );

      const result = await parent["handleResourcesRead"](
        { uri: "github://repos/foo/bar" },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      // @ts-expect-error - type is not present on BlobResourceContents
      expect(result.contents[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect(result.contents[0]?.text).toBe("foo/bar");
    });
  });

  describe("Notifications", () => {
    it("should not emit notifications when mounting pre-initialize", () => {
      const notifications: Array<{ method: string }> = [];

      const parent = new McpServer({ name: "parent", version: "1.0.0" });
      parent._setNotificationSender((_sessionId, notification) => {
        notifications.push(notification);
      });

      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "test",
        {
          handler: () => ({ content: [{ type: "text", text: "ok" }] }),
        },
      );

      parent.group(child);

      expect(notifications).toHaveLength(0);
    });

    it("should emit single notification when mounting post-initialize", async () => {
      const notifications: Array<{ method: string }> = [];

      const parent = new McpServer({ name: "parent", version: "1.0.0" });
      parent._setNotificationSender((_sessionId, notification) => {
        notifications.push(notification);
      });

      await parent._dispatch({
        jsonrpc: "2.0",
        id: "1",
        method: METHODS.INITIALIZE,
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "test",
        {
          handler: () => ({ content: [{ type: "text", text: "ok" }] }),
        },
      );

      parent.group(child);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.method).toBe(
        METHODS.NOTIFICATIONS.TOOLS.LIST_CHANGED,
      );
    });

    it("should emit notifications only for changed kinds", async () => {
      const notifications: Array<{ method: string }> = [];

      const parent = new McpServer({ name: "parent", version: "1.0.0" });
      parent._setNotificationSender((_sessionId, notification) => {
        notifications.push(notification);
      });

      await parent._dispatch({
        jsonrpc: "2.0",
        id: "1",
        method: METHODS.INITIALIZE,
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });

      const child = new McpServer({ name: "child", version: "1.0.0" }).tool(
        "test",
        {
          handler: () => ({ content: [{ type: "text", text: "ok" }] }),
        },
      );

      parent.group(child);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.method).toBe(
        METHODS.NOTIFICATIONS.TOOLS.LIST_CHANGED,
      );
    });
  });

  describe("Integration", () => {
    it("should compose multiple children with different prefixes", async () => {
      const git = new McpServer({ name: "git", version: "1.0.0" }).tool(
        "clone",
        {
          handler: () => ({ content: [{ type: "text", text: "cloned" }] }),
        },
      );

      const fs = new McpServer({ name: "fs", version: "1.0.0" }).tool(
        "readFile",
        {
          handler: () => ({
            content: [{ type: "text", text: "file content" }],
          }),
        },
      );

      const db = new McpServer({ name: "db", version: "1.0.0" }).tool("query", {
        handler: () => ({ content: [{ type: "text", text: "query result" }] }),
      });

      const app = new McpServer({ name: "app", version: "1.0.0" })
        .group("git", git)
        .group("fs", fs)
        .group("db", db);

      const toolsList = await app["handleToolsList"](
        {},
        {} as MCPServerContext,
      );
      expect(toolsList.tools).toHaveLength(3);
      expect(toolsList.tools.map((t) => t.name).sort()).toEqual([
        "db/query",
        "fs/readFile",
        "git/clone",
      ]);

      const gitResult = await app["handleToolsCall"](
        { name: "git/clone", arguments: {} },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      expect((gitResult as ToolCallResult).content[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect((gitResult as ToolCallResult).content[0]?.text).toBe("cloned");

      const fsResult = await app["handleToolsCall"](
        { name: "fs/readFile", arguments: {} },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      expect((fsResult as ToolCallResult).content[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect((fsResult as ToolCallResult).content[0]?.text).toBe(
        "file content",
      );

      const dbResult = await app["handleToolsCall"](
        { name: "db/query", arguments: {} },
        { validate: () => ({}) } as unknown as MCPServerContext,
      );
      expect((dbResult as ToolCallResult).content[0]?.type).toBe("text");
      // @ts-expect-error - text is the expected property of TextContent, but not present on other Content types
      expect((dbResult as ToolCallResult).content[0]?.text).toBe(
        "query result",
      );
    });
  });
});
