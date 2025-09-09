import {
  JSON_RPC_VERSION,
  MCP_PROTOCOL_HEADER,
  MCP_SESSION_ID_HEADER,
  SSE_ACCEPT_HEADER,
  SUPPORTED_MCP_PROTOCOL_VERSION,
} from "./constants.js";
import type { McpServer } from "./core.js";
import { RpcError } from "./errors.js";
import { createSSEStream, type StreamWriter } from "./sse-writer.js";
import type { EventStore, SessionId, SessionMeta } from "./store.js";
import {
  createJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isValidJsonRpcMessage,
  JSON_RPC_ERROR_CODES,
  type JsonRpcMessage,
  type JsonRpcReq,
} from "./types.js";

function parseJsonRpc(body: string): unknown {
  try {
    const parsed = JSON.parse(body);
    return parsed;
  } catch (_error) {
    throw new RpcError(JSON_RPC_ERROR_CODES.PARSE_ERROR, "Invalid JSON");
  }
}

function keyForSession(sessionId: string): string {
  return `session:${sessionId}`;
}

function keyForRequest(sessionId: string, requestId: string | number): string {
  return `session:${sessionId}:request:${requestId}`;
}

interface SessionData {
  meta: SessionMeta;
}

export interface StreamableHttpTransportOptions {
  eventStore?: EventStore;
  generateSessionId?: () => string;
  /** Allowed Origin headers for CORS validation  */
  allowedOrigins?: string[];
  /** Allowed Host headers for preventing Host header attacks */
  allowedHosts?: string[];
}

export class StreamableHttpTransport {
  private server?: McpServer;
  private generateSessionId: () => string;
  private eventStore?: EventStore;
  private allowedOrigins?: string[];
  private allowedHosts?: string[];
  private sessions = new Map<SessionId, SessionData>();
  private writers = new Map<string, StreamWriter>();

  constructor(options: StreamableHttpTransportOptions = {}) {
    this.generateSessionId =
      options.generateSessionId ?? (() => crypto.randomUUID());
    this.eventStore = options.eventStore;
    this.allowedOrigins = options.allowedOrigins;
    this.allowedHosts = options.allowedHosts;
  }

  bind(server: McpServer): (request: Request) => Promise<Response> {
    this.server = server;

    server._setNotificationSender(async (sessionId, notification, options) => {
      const jsonRpcNotification = {
        jsonrpc: JSON_RPC_VERSION,
        method: notification.method,
        params: notification.params,
      };

      if (sessionId) {
        const relatedRequestId = options?.relatedRequestId;

        // Route to specific request stream if relatedRequestId is provided
        if (relatedRequestId) {
          const requestKey = keyForRequest(sessionId, relatedRequestId);
          const writer = this.writers.get(requestKey);
          if (writer) {
            // CRITICAL FIX: Use "0" event ID for request streams, don't persist to eventStore
            writer.write("0", jsonRpcNotification);
            return;
          }
        }

        // Fallback to session stream
        const sessionKey = keyForSession(sessionId);
        const writer = this.writers.get(sessionKey);
        if (writer) {
          if (this.eventStore) {
            const eventId = await this.eventStore.send(
              sessionId,
              jsonRpcNotification,
            );
            writer.write(eventId, jsonRpcNotification);
          } else {
            writer.write("0", jsonRpcNotification);
          }
        }
      } else {
        // CRITICAL FIX: Don't broadcast when no sessionId - just return/discard
        return;
      }
    });

    return this.handleRequest.bind(this);
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (!this.server) {
      throw new Error("Transport not bound to a server");
    }

    if (this.allowedHosts) {
      const host = request.headers.get("Host");
      if (host && !this.allowedHosts.includes(host)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    if (this.allowedOrigins) {
      const origin = request.headers.get("Origin");
      if (origin && !this.allowedOrigins.includes(origin)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    switch (request.method) {
      case "POST":
        return this.handlePost(request);
      case "GET":
        return this.handleGet(request);
      case "DELETE":
        return this.handleDelete(request);
      default: {
        const errorResponse = createJsonRpcError(
          null,
          new RpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            "Method not supported",
          ).toJson(),
        );
        return new Response(JSON.stringify(errorResponse), {
          status: 405,
          headers: {
            Allow: "POST, GET, DELETE",
          },
        });
      }
    }
  }

  private async handlePost(request: Request): Promise<Response> {
    try {
      const body = await request.text();
      const jsonRpcRequest = parseJsonRpc(body);

      // Check if it's a JSON-RPC response first
      if (isJsonRpcResponse(jsonRpcRequest)) {
        // Accept responses but don't process them, just return 202
        return new Response(null, { status: 202 });
      }

      if (!isValidJsonRpcMessage(jsonRpcRequest)) {
        const errorResponse = createJsonRpcError(
          null,
          new RpcError(
            JSON_RPC_ERROR_CODES.INVALID_REQUEST,
            "Invalid JSON-RPC 2.0 message format",
          ).toJson(),
        );
        return new Response(JSON.stringify(errorResponse), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      const isNotification = isJsonRpcNotification(jsonRpcRequest);
      const isInitializeRequest =
        (jsonRpcRequest as JsonRpcMessage).method === "initialize";
      const acceptHeader = request.headers.get("Accept");
      const protocolHeader = request.headers.get(MCP_PROTOCOL_HEADER);

      if (!isInitializeRequest) {
        if (
          protocolHeader &&
          protocolHeader !== SUPPORTED_MCP_PROTOCOL_VERSION
        ) {
          const responseId = isNotification
            ? null
            : (jsonRpcRequest as JsonRpcReq).id;
          const errorResponse = createJsonRpcError(
            responseId,
            new RpcError(
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              "Protocol version mismatch",
              {
                expectedVersion: SUPPORTED_MCP_PROTOCOL_VERSION,
                receivedVersion: protocolHeader,
              },
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      }
      const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);

      // CRITICAL FIX: Always validate session for non-initialize requests when eventStore is present
      if (!isInitializeRequest && this.eventStore) {
        if (!sessionId || !this.sessions.has(sessionId)) {
          const responseId = isNotification
            ? null
            : (jsonRpcRequest as JsonRpcReq).id;
          const errorResponse = createJsonRpcError(
            responseId,
            new RpcError(
              JSON_RPC_ERROR_CODES.INVALID_REQUEST,
              "Invalid or missing session ID",
            ).toJson(),
          );
          return new Response(JSON.stringify(errorResponse), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      }

      if (!isInitializeRequest && acceptHeader?.endsWith(SSE_ACCEPT_HEADER)) {
        // sessionId is guaranteed to be valid here due to validation above
        if (!sessionId) {
          throw new Error("sessionId should be validated before this point");
        }

        // For POST with SSE, support per-request streams
        // Use the JSON-RPC request ID, not a URL parameter
        if (isNotification) {
          return new Response(
            "Bad Request: POST SSE requires a request with 'id' (notifications not supported)",
            {
              status: 400,
            },
          );
        }

        const requestId = (jsonRpcRequest as JsonRpcReq).id;
        if (requestId === null || requestId === undefined) {
          return new Response(
            "Bad Request: POST SSE requires a request with 'id'",
            {
              status: 400,
            },
          );
        }

        const streamKey = keyForRequest(sessionId, String(requestId));

        if (this.writers.has(streamKey)) {
          return new Response("Conflict: Stream already exists for request", {
            status: 409,
          });
        }

        const { stream, writer } = createSSEStream();
        this.writers.set(streamKey, writer);

        const [responseStream, monitorStream] = stream.tee();
        monitorStream
          .pipeTo(
            new WritableStream({
              close: () => {
                this.writers.delete(streamKey);
                writer.end();
              },
              abort: () => {
                this.writers.delete(streamKey);
                writer.end();
              },
            }),
          )
          .catch(() => {
            this.writers.delete(streamKey);
            writer.end();
          });

        // No replay support for request streams - only for session streams

        Promise.resolve(
          this.server?._dispatch(jsonRpcRequest, {
            sessionId,
          }),
        )
          .then(async (rpcResponse) => {
            if (rpcResponse !== null) {
              // CRITICAL FIX: Never persist to eventStore for request streams
              writer.write("0", rpcResponse);
            }
          })
          .catch((err) => {
            // On unexpected error, send an INTERNAL_ERROR response if possible
            try {
              const responseId = isNotification
                ? null
                : (jsonRpcRequest as JsonRpcReq).id;
              if (responseId !== null && responseId !== undefined) {
                const errorResponse = createJsonRpcError(
                  responseId,
                  new RpcError(
                    JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    "Internal error",
                    err instanceof Error ? { message: err.message } : err,
                  ).toJson(),
                );
                if (this.eventStore) {
                  // CRITICAL FIX: Never persist to eventStore for request streams
                  writer.write("0", errorResponse);
                } else {
                  writer.write("0", errorResponse);
                }
              }
            } catch (_) {}
          })
          .finally(() => {
            writer.end();
            this.writers.delete(streamKey);
          });

        return new Response(responseStream, {
          status: 200,
          headers: {
            "Content-Type": SSE_ACCEPT_HEADER,
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            [MCP_SESSION_ID_HEADER]: sessionId,
          },
        });
      }

      const response = await this.server?._dispatch(jsonRpcRequest, {
        sessionId: sessionId || undefined,
      });

      if (isInitializeRequest && response) {
        const sessionId = this.generateSessionId();
        const sessionMeta: SessionMeta = {
          protocolVersion: protocolHeader || SUPPORTED_MCP_PROTOCOL_VERSION,
          clientInfo: (jsonRpcRequest as JsonRpcReq).params,
        };

        this.sessions.set(sessionId, { meta: sessionMeta });

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            [MCP_SESSION_ID_HEADER]: sessionId,
          },
        });
      }

      if (response === null) {
        return new Response(null, { status: 202 });
      } else {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (!isInitializeRequest) {
          const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);
          if (sessionId) {
            headers[MCP_SESSION_ID_HEADER] = sessionId;
          }
        }

        return new Response(JSON.stringify(response), {
          status: 200,
          headers,
        });
      }
    } catch (error) {
      const errorResponse = createJsonRpcError(
        null,
        new RpcError(
          JSON_RPC_ERROR_CODES.PARSE_ERROR,
          "Parse error",
          error instanceof Error ? error.message : "Unknown parsing error",
        ).toJson(),
      );

      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  }

  private async handleGet(request: Request): Promise<Response> {
    const accept = request.headers.get("Accept");
    if (!accept || !accept.endsWith(SSE_ACCEPT_HEADER)) {
      return new Response(
        "Bad Request: Accept header must be text/event-stream",
        {
          status: 400,
        },
      );
    }

    const protocolHeader = request.headers.get(MCP_PROTOCOL_HEADER);
    if (protocolHeader && protocolHeader !== SUPPORTED_MCP_PROTOCOL_VERSION) {
      return new Response("Bad Request: Protocol version mismatch", {
        status: 400,
      });
    }

    const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);
    if (!sessionId || !this.sessions.has(sessionId)) {
      return new Response("Bad Request: Invalid or missing session ID", {
        status: 400,
      });
    }

    const sessionKey = keyForSession(sessionId);

    if (this.writers.has(sessionKey)) {
      return new Response("Conflict: Stream already exists for session", {
        status: 409,
      });
    }

    const { stream, writer } = createSSEStream();
    this.writers.set(sessionKey, writer);

    const [responseStream, monitorStream] = stream.tee();
    monitorStream
      .pipeTo(
        new WritableStream({
          close: () => {
            this.writers.delete(sessionKey);
            writer.end();
          },
          abort: () => {
            this.writers.delete(sessionKey);
            writer.end();
          },
        }),
      )
      .catch(() => {
        this.writers.delete(sessionKey);
        writer.end();
      });

    // Only provide replay for standalone GET streams when eventStore is available
    const lastEventId = request.headers.get("Last-Event-ID");
    if (lastEventId && this.eventStore) {
      try {
        await this.eventStore.replay(
          sessionId,
          lastEventId,
          (eventId: string, message: unknown) => {
            writer.write(eventId, message);
          },
        );
      } catch (_error) {
        writer.end();
        this.writers.delete(sessionKey);
        return new Response("Internal Server Error: Replay failed", {
          status: 500,
        });
      }
    }

    return new Response(responseStream, {
      status: 200,
      headers: {
        "Content-Type": SSE_ACCEPT_HEADER,
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [MCP_SESSION_ID_HEADER]: sessionId,
      },
    });
  }

  private async handleDelete(request: Request): Promise<Response> {
    const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);
    if (!sessionId) {
      return new Response("Bad Request: Missing session ID", {
        status: 400,
      });
    }

    // Close session stream
    const sessionKey = keyForSession(sessionId);
    const sessionWriter = this.writers.get(sessionKey);
    if (sessionWriter) {
      sessionWriter.end();
      this.writers.delete(sessionKey);
    }

    // Close all request streams for this session
    const requestKeysToDelete: string[] = [];
    for (const [key] of this.writers) {
      if (key.startsWith(`req:${sessionId}:`)) {
        requestKeysToDelete.push(key);
      }
    }

    for (const key of requestKeysToDelete) {
      const writer = this.writers.get(key);
      if (writer) {
        writer.end();
        this.writers.delete(key);
      }
    }

    this.sessions.delete(sessionId);

    return new Response(null, { status: 200 });
  }
}
