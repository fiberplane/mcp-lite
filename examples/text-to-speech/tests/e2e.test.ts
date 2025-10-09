import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createExampleServer,
  createMcpClient,
  type TestServer,
} from "@internal/test-utils";

// Skip tests if no API key is available
const hasApiKey = !!process.env.ELEVENLABS_API_KEY;
const describeIfApiKey = hasApiKey ? describe : describe.skip;

describe("Text-to-Speech Example", () => {
  let server: TestServer;

  beforeAll(async () => {
    // Start the example server
    server = await createExampleServer(() => import("../src/index.ts"));
  });

  afterAll(async () => {
    await server?.stop();

    // Clean up test output files
    const outputDir = join(process.cwd(), "output");
    if (existsSync(outputDir)) {
      const files = await readdir(outputDir);
      const testFiles = files.filter(
        (f) => f.startsWith("test-") || f.includes("test"),
      );
      for (const file of testFiles) {
        await rm(join(outputDir, file), { force: true });
      }
    }
  });

  describe("Tool Listing", () => {
    it("should expose the text_to_speech tool", async () => {
      // Initialize without elicitation capability
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

      const textToSpeechTool = tools[0];
      expect(textToSpeechTool.name).toBe("text_to_speech");
      expect(textToSpeechTool.description).toContain("text to speech");

      // Verify input schema
      expect(textToSpeechTool.inputSchema).toMatchObject({
        type: "object",
        properties: {
          text: {
            type: "string",
          },
          outputFilename: {
            type: "string",
          },
        },
        required: ["text"],
      });
    });
  });

  describeIfApiKey("Tool Execution", () => {
    it("should convert text to speech with default voice (no elicitation)", async () => {
      // Initialize WITHOUT elicitation capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-no-elicit",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {}, // No elicitation
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      const response = await client.request("tools/call", {
        name: "text_to_speech",
        arguments: {
          text: "Hello, this is a test.",
        },
      });

      expect(response.error).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: tests
      const result = response.result as any;
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(2);

      // Check text content
      const textContent = result.content[0];
      expect(textContent.type).toBe("text");
      expect(textContent.text).toContain("Successfully converted");
      expect(textContent.text).toContain("Rachel"); // Default voice

      // Check audio content
      const audioContent = result.content[1];
      expect(audioContent.type).toBe("audio");
      expect(audioContent.mimeType).toBe("audio/mpeg");
      expect(audioContent.data).toBeDefined();
      expect(typeof audioContent.data).toBe("string");
      // Verify it's base64 encoded
      expect(audioContent.data.length).toBeGreaterThan(0);

      // Verify file was created
      const outputDir = join(process.cwd(), "output");
      expect(existsSync(outputDir)).toBe(true);

      const files = await readdir(outputDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.endsWith(".mp3"))).toBe(true);
    });

    it("should convert text to speech with custom filename", async () => {
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-custom",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      const customFilename = `test-custom-${Date.now()}`;
      const response = await client.request("tools/call", {
        name: "text_to_speech",
        arguments: {
          text: "Custom filename test.",
          outputFilename: customFilename,
        },
      });

      expect(response.error).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: tests
      const result = response.result as any;

      // Check that the custom filename is mentioned
      const textContent = result.content[0];
      expect(textContent.text).toContain(`${customFilename}.mp3`);

      // Verify file exists with custom name
      const outputDir = join(process.cwd(), "output");
      const files = await readdir(outputDir);
      expect(files).toContain(`${customFilename}.mp3`);
    });

    it("should handle very short text", async () => {
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-short",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      const response = await client.request("tools/call", {
        name: "text_to_speech",
        arguments: {
          text: "Hi",
        },
      });

      expect(response.error).toBeUndefined();
      // biome-ignore lint/suspicious/noExplicitAny: tests
      const result = response.result as any;
      expect(result.content).toBeDefined();
      expect(result.content.length).toBe(2);
      expect(result.content[1].type).toBe("audio");
    });
  });

  describe("Input Validation", () => {
    it("should reject missing required text parameter", async () => {
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-validation",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Missing required 'text' field
      await expect(
        client.request("tools/call", {
          name: "text_to_speech",
          arguments: {},
        }),
      ).rejects.toThrow();
    });

    it("should reject wrong type for text parameter", async () => {
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-type",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Wrong type for 'text' (number instead of string)
      await expect(
        client.request("tools/call", {
          name: "text_to_speech",
          arguments: {
            text: 12345,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle empty string text gracefully", async () => {
      // While the schema requires a string, empty strings are technically valid
      // but might cause issues with the TTS service
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-empty",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("MCP-Session-Id");
      const client = createMcpClient({
        baseUrl: server.url,
        sessionId: sessionId as string,
      });

      // Empty string should either work or return a clear error
      const response = await client.request("tools/call", {
        name: "text_to_speech",
        arguments: {
          text: "",
        },
      });

      // biome-ignore lint/suspicious/noExplicitAny: tests
      const result = response.result as any;
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      // Either success or error, but should handle gracefully
    });
  });

  describeIfApiKey("Elicitation Flow", () => {
    it("should initiate voice selection when client supports elicitation", async () => {
      // Initialize WITH elicitation capability
      const initResponse = await fetch(server.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-elicit",
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
            capabilities: {
              elicitation: {},
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

      // Open SSE stream to receive elicitation request
      const stream = await client.openRequestStream(
        "tools/call",
        {
          name: "text_to_speech",
          arguments: {
            text: "Elicitation test",
          },
        },
        "test-elicit-1",
      );

      // Read the first event from the stream
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      const { value } = await reader.read();
      const chunk = decoder.decode(value);

      // Should receive an elicitation/create request
      expect(chunk).toContain("elicitation/create");
      expect(chunk).toContain("Rachel"); // Default voice name should be mentioned
      expect(chunk).toContain("pick a different ElevenLabs voice");

      // Clean up
      reader.releaseLock();
    });
  });
});
