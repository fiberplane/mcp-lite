import { describe, expect, it } from "bun:test";
import { McpServer } from "../../src/core.js";
import type { MCPServerContext } from "../../src/types.js";

describe("Logger", () => {
  it("should use console as default logger", () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });
    expect(server.logger).toBe(console);
  });

  it("should use custom logger when provided", () => {
    const logs: string[] = [];
    const customLogger = {
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
      warn: (msg: string) => logs.push(`WARN: ${msg}`),
      info: (msg: string) => logs.push(`INFO: ${msg}`),
      debug: (msg: string) => logs.push(`DEBUG: ${msg}`),
    };

    const server = new McpServer({
      name: "test",
      version: "1.0.0",
      logger: customLogger,
    });

    expect(server.logger).toBe(customLogger);
  });

  it("should log error when child middleware doesn't call next()", async () => {
    const logs: string[] = [];
    const customLogger = {
      error: (msg: string) => logs.push(msg),
      warn: () => {},
      info: () => {},
      debug: () => {},
    };

    const parent = new McpServer({
      name: "parent",
      version: "1.0.0",
      logger: customLogger,
    });

    const child = new McpServer({ name: "child", version: "1.0.0" })
      .use(async (_ctx, _next) => {
        // Intentionally NOT calling next()
      })
      .tool("test", {
        handler: () => ({ content: [{ type: "text", text: "ok" }] }),
      });

    parent.group(child);

    try {
      await parent.handleToolsCall({ name: "test", arguments: {} }, {
        validate: () => ({}),
      } as MCPServerContext);
      expect(true).toBe(false); // Should not reach here
    } catch (_error) {
      // Should throw error
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("Handler was not executed");
      expect(logs[0]).toContain("middleware");
      expect(logs[0]).toContain("did not call next()");
    }
  });

  it("should log error when resource handler not called", async () => {
    const logs: string[] = [];
    const customLogger = {
      error: (msg: string) => logs.push(msg),
      warn: () => {},
      info: () => {},
      debug: () => {},
    };

    const parent = new McpServer({
      name: "parent",
      version: "1.0.0",
      logger: customLogger,
    });

    const child = new McpServer({ name: "child", version: "1.0.0" })
      .use(async (_ctx, _next) => {
        // Intentionally NOT calling next()
      })
      .resource(
        "file://test.txt",
        { description: "Test file" },
        async (uri) => ({
          contents: [{ uri: uri.href, type: "text", text: "content" }],
        }),
      );

    parent.group(child);

    try {
      await parent.handleResourcesRead({ uri: "file://test.txt" }, {
        validate: () => ({}),
      } as MCPServerContext);
      expect(true).toBe(false); // Should not reach here
    } catch (_error) {
      // Should throw error
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain("Resource handler was not executed");
      expect(logs[0]).toContain("middleware");
    }
  });

  it("should allow disabling logs with no-op logger", async () => {
    const noopLogger = {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    };

    const parent = new McpServer({
      name: "parent",
      version: "1.0.0",
      logger: noopLogger,
    });

    const child = new McpServer({ name: "child", version: "1.0.0" })
      .use(async (_ctx, _next) => {
        // Intentionally NOT calling next()
      })
      .tool("test", {
        handler: () => ({ content: [{ type: "text", text: "ok" }] }),
      });

    parent.group(child);

    // Should not throw during test setup, just when calling the tool
    try {
      await parent.handleToolsCall({ name: "test", arguments: {} }, {
        validate: () => ({}),
      } as MCPServerContext);
    } catch (error) {
      // Error should be thrown, but no logs should be produced
      expect(error).toBeDefined();
    }
  });
});
