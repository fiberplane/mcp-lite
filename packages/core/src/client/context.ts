import type { JsonRpcReq } from "../types.js";
import type { CreateClientContextOptions, MCPClientContext } from "./types.js";

/**
 * Create a client context for handling server-initiated requests.
 * This mirrors createContext but for client-side request handling.
 */
export function createClientContext(
  message: JsonRpcReq,
  requestId: string | number,
  options?: CreateClientContextOptions,
): MCPClientContext {
  return {
    request: message,
    requestId,
    response: null,
    env: {},
    state: {},
    connection: options?.connection,
  };
}
