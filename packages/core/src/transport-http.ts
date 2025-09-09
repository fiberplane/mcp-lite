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
import {
  InMemoryStore,
  type SessionId,
  type SessionMeta,
  type SessionStore,
} from "./store.js";
import {
  createJsonRpcError,
  isJsonRpcNotification,
  isValidJsonRpcMessage,
  JSON_RPC_ERROR_CODES,
  type JsonRpcReq,
} from "./types.js";

function parseJsonRpc(body: string): unknown {
  try {
    const parsed = JSON.parse(body);
    return parsed;
  } catch (_error) {
    throw new Error("Invalid JSON");
  }
}

interface SessionState {
  meta: SessionMeta;
  writer?: StreamWriter;
}

export interface StreamableHttpTransportOptions {
  generateSessionId?: () => string;
  sessionStore?: SessionStore;
  allowedHosts?: string[];
}

export class StreamableHttpTransport {
  private server?: McpServer;
  private generateSessionId: () => string;
  private store?: SessionStore;
  private allowedHosts?: string[];
  private sessions = new Map<SessionId, SessionState>();
  private streamWriters = new Map<SessionId, StreamWriter>();

  constructor(options: StreamableHttpTransportOptions = {}) {
    this.generateSessionId =
      options.generateSessionId ?? (() => crypto.randomUUID());
    this.store = options.sessionStore ?? new InMemoryStore();
    this.allowedHosts = options.allowedHosts;
  }

  bind(server: McpServer): (request: Request) => Promise<Response> {
    this.server = server;

    server._setNotificationSender(async (sessionId, notification) => {
      const jsonRpcNotification = {
        jsonrpc: JSON_RPC_VERSION,
        method: notification.method,
        params: notification.params,
      };

      if (sessionId && this.store) {
        const eventId = await this.store.send(sessionId, jsonRpcNotification);
        const writer = this.streamWriters.get(sessionId);
        if (writer) {
          writer.write(eventId, jsonRpcNotification);
        }
      } else if (sessionId) {
        const writer = this.streamWriters.get(sessionId);
        if (writer) {
          writer.write("0", jsonRpcNotification);
        }
      } else {
        for (const [id, writer] of this.streamWriters) {
          if (this.store) {
            const eventId = await this.store.send(id, jsonRpcNotification);
            writer.write(eventId, jsonRpcNotification);
          } else {
            writer.write("0", jsonRpcNotification);
          }
        }
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
      const isInitializeRequest = jsonRpcRequest.method === "initialize";
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

      if (!isInitializeRequest && this.store) {
        const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);
        if (!sessionId || !this.store.has(sessionId)) {
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
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          });
        }
      }

      const sessionId = request.headers.get(MCP_SESSION_ID_HEADER);

      if (!isInitializeRequest && acceptHeader?.endsWith(SSE_ACCEPT_HEADER)) {
        if (!sessionId || !this.store?.has(sessionId)) {
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
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (this.streamWriters.has(sessionId)) {
          return new Response("Conflict: Stream already exists for session", {
            status: 409,
          });
        }

        const { stream, writer } = createSSEStream();
        this.streamWriters.set(sessionId, writer);

        const [responseStream, monitorStream] = stream.tee();
        monitorStream
          .pipeTo(
            new WritableStream({
              close: () => {
                this.streamWriters.delete(sessionId);
                writer.end();
              },
              abort: () => {
                this.streamWriters.delete(sessionId);
                writer.end();
              },
            }),
          )
          .catch(() => {
            this.streamWriters.delete(sessionId);
            writer.end();
          });

        const lastEventId = request.headers.get("Last-Event-ID");
        if (lastEventId && this.store) {
          try {
            await this.store.replay(
              sessionId,
              lastEventId,
              (eventId, message) => {
                writer.write(eventId, message);
              },
            );
          } catch (_error) {
            writer.end();
            this.streamWriters.delete(sessionId);
            return new Response("Internal Server Error: Replay failed", {
              status: 500,
            });
          }
        }

        Promise.resolve(
          this.server?._dispatch(jsonRpcRequest, {
            sessionId,
          }),
        )
          .then(async (rpcResponse) => {
            if (rpcResponse !== null) {
              if (this.store) {
                const eventId = await this.store.send(sessionId, rpcResponse);
                writer.write(eventId, rpcResponse);
              } else {
                writer.write("0", rpcResponse);
              }
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
                if (this.store) {
                  Promise.resolve(
                    this.store.send(sessionId, errorResponse),
                  ).then((eventId) => writer.write(eventId, errorResponse));
                } else {
                  writer.write("0", errorResponse);
                }
              }
            } catch (_) {}
          })
          .finally(() => {
            writer.end();
            this.streamWriters.delete(sessionId);
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

      if (isInitializeRequest && response && this.store) {
        const sessionId = this.generateSessionId();
        const sessionMeta: SessionMeta = {
          protocolVersion: protocolHeader || SUPPORTED_MCP_PROTOCOL_VERSION,
          clientInfo: (jsonRpcRequest as JsonRpcReq).params,
        };

        this.store.create(sessionId, sessionMeta);
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
        return new Response(null, { status: 204 });
      } else {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (!isInitializeRequest && this.store) {
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
    if (!sessionId || !this.store?.has(sessionId)) {
      return new Response("Unauthorized: Invalid or missing session ID", {
        status: 401,
      });
    }

    if (this.streamWriters.has(sessionId)) {
      return new Response("Conflict: Stream already exists for session", {
        status: 409,
      });
    }

    const { stream, writer } = createSSEStream();
    this.streamWriters.set(sessionId, writer);

    const [responseStream, monitorStream] = stream.tee();
    monitorStream
      .pipeTo(
        new WritableStream({
          close: () => {
            this.streamWriters.delete(sessionId);
            writer.end();
          },
          abort: () => {
            this.streamWriters.delete(sessionId);
            writer.end();
          },
        }),
      )
      .catch(() => {
        this.streamWriters.delete(sessionId);
        writer.end();
      });

    const lastEventId = request.headers.get("Last-Event-ID");
    if (lastEventId && this.store) {
      try {
        await this.store.replay(sessionId, lastEventId, (eventId, message) => {
          writer.write(eventId, message);
        });
      } catch (_error) {
        writer.end();
        this.streamWriters.delete(sessionId);
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

    const writer = this.streamWriters.get(sessionId);
    if (writer) {
      writer.end();
      this.streamWriters.delete(sessionId);
    }

    if (this.store) {
      this.store.delete(sessionId);
    }

    this.sessions.delete(sessionId);

    return new Response(null, { status: 200 });
  }
}
