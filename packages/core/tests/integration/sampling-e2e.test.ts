/** biome-ignore-all lint/style/noNonNullAssertion: tests */
/** biome-ignore-all lint/suspicious/noExplicitAny: tests */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { collectSseEventsCount } from "../../../test-utils/src/sse.js";
import {
  buildInitializeRequest,
  buildRequest,
  createStatefulTestServer,
} from "../utils.js";

const buildSamplingInit = () =>
  buildInitializeRequest({
    capabilities: {
      sampling: {},
    },
  });

describe("Sampling E2E Tests", () => {
  test("E2E: ctx.sample() does not throw when client has sampling capability", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("with-sampling", {
      description: "Test sampling support",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        // Check if sampling is supported - this should now return true
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        // If we get here, sampling is supported, which means capabilities were properly stored and passed
        return {
          content: [{ type: "text", text: "Sampling is supported!" }],
        };
      },
    });

    // Initialize session WITH sampling capability
    const initializeRequest = buildSamplingInit();
    const initResponse = await handler(initializeRequest);

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    const toolResponse = await handler(
      buildRequest(
        {
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "with-sampling",
            arguments: {},
          },
        },
        sessionId,
      ),
    );

    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();

    // Now that capabilities are properly stored and passed, ctx.client.supports("sampling") should return true
    expect(toolResult.result.content[0].text).toBe("Sampling is supported!");
  });

  test("E2E: ctx.sample() throws when client lacks sampling capability", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("no-sampling", {
      description: "Test no sampling support",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        try {
          await ctx.sample({
            prompt: "This should fail",
          });
          return { content: [{ type: "text", text: "Should not reach here" }] };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session WITHOUT sampling capability
    const initializeRequest = buildInitializeRequest();
    const initResponse = await handler(initializeRequest);

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    const toolResponse = await handler(
      buildRequest(
        {
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "no-sampling",
            arguments: {},
          },
        },
        sessionId,
      ),
    );

    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();

    // Now returns the proper capability detection error
    // This indicates the capability detection is working correctly
    expect(toolResult.result.content[0].text).toContain(
      "Sampling not supported by client",
    );
  });

  test("E2E: full sampling flow with client text response", async () => {
    // This test verifies the complete sampling flow:
    // 1. Tool calls ctx.sample() with proper params
    // 2. Server sends sampling/createMessage request via SSE
    // 3. Client responds with LLM-generated text via HTTP POST
    // 4. Server resolves the sampling promise with the result
    // 5. Tool completes with the sampling data

    const { server, handler } = createStatefulTestServer();

    server.tool("full-sampling", {
      description: "Test complete sampling flow",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          const result = await ctx.sample({
            prompt: "Generate a creative greeting",
            systemPrompt: "You are a friendly assistant",
            maxTokens: 100,
          });

          return {
            content: [
              {
                type: "text",
                // @ts-expect-error - .text only available on text responses (not image or audio)
                text: `LLM said: ${result.content?.text || "Unknown"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session WITH sampling capability
    const initializeRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "test-client", version: "1.0.0" },
        protocolVersion: "2025-06-18",
        capabilities: {
          sampling: {},
        },
      },
    };

    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify(initializeRequest),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Open SSE stream directly via handler
    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    // Set up event collection from the SSE stream
    const sseEventPromise = collectSseEventsCount(sseResponse.body!, 2, 5000);

    // Start tool call (without SSE - regular POST)
    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "full-sampling",
            arguments: {},
          },
        }),
      }),
    );

    // Wait for events from SSE stream
    const events = await sseEventPromise;
    expect(events).toHaveLength(2); // ping + sampling

    // First event is ping, second is sampling
    const samplingData = events[1].data as any;
    expect(samplingData.method).toBe("sampling/createMessage");
    // We send a single user message
    expect(samplingData.params.messages).toHaveLength(1);
    expect(samplingData.params.messages[0].role).toBe("user");
    expect(samplingData.params.messages[0].content.type).toBe("text");
    expect(samplingData.params.messages[0].content.text).toBe(
      "Generate a creative greeting",
    );
    expect(samplingData.params.systemPrompt).toBe(
      "You are a friendly assistant",
    );
    expect(samplingData.params.maxTokens).toBe(100);

    // Send client response with text content
    const clientResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: samplingData.id,
          result: {
            role: "assistant",
            model: "gpt-4",
            content: {
              type: "text",
              text: "Hello! How can I help you today?",
            },
          },
        }),
      }),
    );
    expect(clientResponse.status).toBe(202);

    // Wait for tool to complete
    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toBe(
      "LLM said: Hello! How can I help you today?",
    );
  });

  test("E2E: sampling with image response", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("image-sampling", {
      description: "Test sampling with image response",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          const result = await ctx.sample({
            prompt: "Generate an image of a cat",
          });

          if (result.content.type === "image") {
            return {
              content: [
                {
                  type: "text",
                  text: "Received an image response",
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Unexpected type: ${result.content.type}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    const sseEventPromise = collectSseEventsCount(sseResponse.body!, 2, 5000);

    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "image-sampling",
            arguments: {},
          },
        }),
      }),
    );

    const events = await sseEventPromise;
    const samplingData = events[1].data as any;

    // Send response with image content
    await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: samplingData.id,
          result: {
            role: "assistant",
            model: "dall-e-3",
            content: {
              type: "image",
              data: "base64encodedimagedata",
              mimeType: "image/png",
            },
          },
        }),
      }),
    );

    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toBe(
      "Received an image response",
    );
  });

  test("E2E: sampling timeout when client doesn't respond", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("timeout-sampling", {
      description: "Test sampling timeout",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          await ctx.sample(
            {
              prompt: "This will timeout",
            },
            { timeout_ms: 100 }, // Very short timeout
          );

          return {
            content: [{ type: "text", text: "Should not reach here" }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Timeout occurred: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session
    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Open SSE stream but don't respond to sampling
    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    // Call tool - it should timeout since we don't respond
    const toolResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "timeout-sampling",
            arguments: {},
          },
        }),
      }),
    );

    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toContain("Timeout occurred");

    // Clean up SSE
    sseResponse.body?.cancel();
  });

  test("E2E: sampling with invalid client response format", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("invalid-response-sampling", {
      description: "Test sampling with invalid response",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          await ctx.sample({
            prompt: "Say hello",
          });

          return {
            content: [{ type: "text", text: "Should not reach here" }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Validation error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session
    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Open SSE stream
    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    const ssePromise = collectSseEventsCount(sseResponse.body!, 2, 5000);

    // Start tool call
    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "invalid-response-sampling",
            arguments: {},
          },
        }),
      }),
    );

    // Get sampling request
    const events = await ssePromise;
    expect(events).toHaveLength(2);

    const samplingData = events[1].data as any;
    expect(samplingData.method).toBe("sampling/createMessage");

    // Respond with invalid data (missing required content field)
    const invalidResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: samplingData.id,
          result: {
            role: "assistant",
            model: "gpt-4",
            // Missing content field!
          },
        }),
      }),
    );
    expect(invalidResponse.status).toBe(202);

    // The system should handle this with a validation error
    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toContain("Validation error");
    expect(toolResult.result.content[0].text).toContain("response format");
  });

  test("E2E: sampling with client error response", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("error-response-sampling", {
      description: "Test sampling with client error",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          await ctx.sample({
            prompt: "This will cause client error",
          });

          return {
            content: [{ type: "text", text: "Should not reach here" }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Client error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session
    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    // Open SSE stream
    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    const ssePromise = collectSseEventsCount(sseResponse.body!, 2, 5000);

    // Start tool call
    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "error-response-sampling",
            arguments: {},
          },
        }),
      }),
    );

    // Get sampling request
    const events = await ssePromise;
    expect(events).toHaveLength(2);

    const samplingData = events[1].data as any;
    expect(samplingData.method).toBe("sampling/createMessage");

    // Respond with JSON-RPC error instead of result
    const errorResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: samplingData.id,
          error: {
            code: -32000,
            message: "Model is overloaded",
            data: { details: "Please try again later" },
          },
        }),
      }),
    );
    expect(errorResponse.status).toBe(202);

    // Verify error is propagated
    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toContain("Client error:");
    expect(toolResult.result.content[0].text).toContain("Model is overloaded");
  });

  test("E2E: multiple sequential sampling requests in one tool", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("sequential-sampling", {
      description: "Test multiple sequential sampling requests",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          const result1 = await ctx.sample({
            prompt: "Generate a topic",
          });

          // @ts-expect-error - .text only available on text responses
          const topic = result1.content.text;

          const result2 = await ctx.sample({
            prompt: `Write a haiku about ${topic}`,
          });

          return {
            content: [
              {
                type: "text",
                // @ts-expect-error - .text only available on text responses
                text: `Topic: ${topic}\nHaiku: ${result2.content.text}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    // Initialize session
    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    let samplingCount = 0;
    const samplingResponses: Array<{ id: string; prompt: string }> = [];

    // Open SSE stream and start event collection
    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    // Create a promise to handle SSE events as they arrive
    const sseEventHandler = new Promise<void>((resolve) => {
      if (!sseResponse.body) {
        resolve();
        return;
      }

      const reader = sseResponse.body.getReader();
      const decoder = new TextDecoder();

      const readEvents = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.method === "sampling/createMessage") {
                    samplingCount++;
                    const prompt = data.params.messages[0].content.text;
                    samplingResponses.push({
                      id: data.id,
                      prompt,
                    });

                    // Respond immediately to each sampling request
                    const responseText =
                      prompt === "Generate a topic"
                        ? "cats"
                        : "Soft furry friend\nPurring in the afternoon\nPeaceful lazy nap";

                    await handler(
                      new Request("http://localhost:3000/", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          "MCP-Protocol-Version": "2025-06-18",
                          "MCP-Session-Id": sessionId,
                        },
                        body: JSON.stringify({
                          jsonrpc: "2.0",
                          id: data.id,
                          result: {
                            role: "assistant",
                            model: "gpt-4",
                            content: {
                              type: "text",
                              text: responseText,
                            },
                          },
                        }),
                      }),
                    );

                    // Stop after handling 2 sampling requests
                    if (samplingCount >= 2) {
                      resolve();
                      return;
                    }
                  }
                } catch (_e) {
                  // Ignore parse errors (pings, etc.)
                }
              }
            }
          }
        } catch (_error) {
          resolve();
        }
      };

      readEvents();
    });

    // Start tool call
    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "sequential-sampling",
            arguments: {},
          },
        }),
      }),
    );

    // Wait for all sampling requests to be handled (with timeout)
    await Promise.race([
      sseEventHandler,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SSE timeout")), 5000),
      ),
    ]);

    // Verify we got both sampling requests
    expect(samplingCount).toBe(2);
    expect(samplingResponses[0].prompt).toBe("Generate a topic");
    expect(samplingResponses[1].prompt).toBe("Write a haiku about cats");

    // Verify final tool result
    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toContain("Topic: cats");
    expect(toolResult.result.content[0].text).toContain("Soft furry friend");
  });

  test("E2E: sampling with model preferences", async () => {
    const { server, handler } = createStatefulTestServer();

    server.tool("sampling-with-preferences", {
      description: "Test sampling with model preferences",
      inputSchema: z.object({}),
      handler: async (_, ctx) => {
        if (!ctx.client.supports("sampling")) {
          return {
            content: [{ type: "text", text: "Sampling not supported" }],
          };
        }

        try {
          const result = await ctx.sample({
            prompt: "Say hello",
            modelPreferences: {
              hints: [{ name: "gpt-4" }, { name: "claude-3" }],
              intelligencePriority: 0.9,
              speedPriority: 0.3,
            },
          });

          return {
            content: [
              {
                type: "text",
                // @ts-expect-error - .text only available on text responses
                text: `Response: ${result.content.text}, Model: ${result.model}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
          };
        }
      },
    });

    const initResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            clientInfo: { name: "test-client", version: "1.0.0" },
            protocolVersion: "2025-06-18",
            capabilities: { sampling: {} },
          },
        }),
      }),
    );

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers.get("mcp-session-id")!;

    const sseResponse = await handler(
      new Request("http://localhost:3000/", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
      }),
    );
    expect(sseResponse.status).toBe(200);

    const sseEventPromise = collectSseEventsCount(sseResponse.body!, 2, 5000);

    const toolPromise = handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call-1",
          method: "tools/call",
          params: {
            name: "sampling-with-preferences",
            arguments: {},
          },
        }),
      }),
    );

    const events = await sseEventPromise;
    const samplingData = events[1].data as any;

    // Verify model preferences were passed through
    expect(samplingData.params.modelPreferences).toBeDefined();
    expect(samplingData.params.modelPreferences.hints).toHaveLength(2);
    expect(samplingData.params.modelPreferences.hints[0].name).toBe("gpt-4");
    expect(samplingData.params.modelPreferences.intelligencePriority).toBe(0.9);
    expect(samplingData.params.modelPreferences.speedPriority).toBe(0.3);

    // Send response
    await handler(
      new Request("http://localhost:3000/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
          "MCP-Session-Id": sessionId,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: samplingData.id,
          result: {
            role: "assistant",
            model: "gpt-4",
            content: {
              type: "text",
              text: "Hello there!",
            },
          },
        }),
      }),
    );

    const toolResponse = await toolPromise;
    expect(toolResponse.status).toBe(200);
    const toolResult = await toolResponse.json();
    expect(toolResult.result.content[0].text).toBe(
      "Response: Hello there!, Model: gpt-4",
    );
  });
});
