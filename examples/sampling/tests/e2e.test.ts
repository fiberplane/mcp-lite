import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  createExampleServer,
  createMcpClient,
  type TestServer,
} from "@internal/test-utils";

describe("Sampling Example", () => {
  let server: TestServer;

  beforeAll(async () => {
    // Start the example server
    server = await createExampleServer(() => import("../src/index.ts"));
  });

  afterAll(async () => {
    await server?.stop();
  });

  describe("craft_wonky_prompt Tool", () => {
    it("should expose the craft_wonky_prompt tool", async () => {
      // Initialize with sampling capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {
              sampling: {},
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      expect(sessionId).toBeDefined();

      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      const response = await client.request("tools/list");

      expect(response.error).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: tests
      const tools = (response.result as any).tools;
      expect(tools).toHaveLength(1);

      const craftTool = tools[0];
      expect(craftTool.name).toBe("craft_wonky_prompt");
      expect(craftTool.description).toContain("wonky prompt");

      // Verify input schema
      expect(craftTool.inputSchema).toMatchObject({
        type: "object",
        properties: {
          theme: { type: "string" },
        },
        required: ["theme"],
      });
    });

    it("should reject calls without sampling capability", async () => {
      // Initialize WITHOUT sampling capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {}, // No sampling capability
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Call the tool - should fail with internal error
      try {
        await client.request("tools/call", {
          name: "craft_wonky_prompt",
          arguments: {
            theme: "rubber ducks",
          },
        });
        throw new Error("Expected request to throw");
      } catch (error) {
        // biome-ignore lint/suspicious/noExplicitAny: tests
        const err = error as any;
        // The error gets wrapped as "Internal error" with details in data
        expect(err.message).toContain("Internal error");
        expect(err.data?.message).toContain(
          "requires a client that supports sampling",
        );
      }
    });

    it("should validate input schema", async () => {
      // Initialize with sampling capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {
              sampling: {},
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Missing required field
      await expect(
        client.request("tools/call", {
          name: "craft_wonky_prompt",
          arguments: {},
        }),
      ).rejects.toThrow("JSON-RPC Error");

      // Wrong type
      await expect(
        client.request("tools/call", {
          name: "craft_wonky_prompt",
          arguments: {
            theme: 123, // Should be string
          },
        }),
      ).rejects.toThrow("JSON-RPC Error");
    });
  });

  describe("Sampling Integration", () => {
    it("should initiate sampling flow when called with valid input", async () => {
      // Initialize with sampling capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {
              sampling: {},
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      expect(sessionId).toBeDefined();

      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Open SSE stream to receive sampling request
      const stream = await client.openRequestStream(
        "tools/call",
        {
          name: "craft_wonky_prompt",
          arguments: {
            theme: "existential rubber ducks",
          },
        },
        "test-call-1",
      );

      // Read the first event from the stream
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const { value } = await reader.read();
      const chunk = decoder.decode(value);

      // Should receive a sampling/createMessage request
      expect(chunk).toContain("sampling/createMessage");
      expect(chunk).toContain("existential rubber ducks");

      // Clean up
      reader.releaseLock();
    });
  });
});
