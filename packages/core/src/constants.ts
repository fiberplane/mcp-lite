export const JSON_RPC_VERSION = "2.0";

export const SUPPORTED_MCP_PROTOCOL_VERSION = "2025-06-18";

export const MCP_PROTOCOL_HEADER = "MCP-Protocol-Version";

export const MCP_SESSION_ID_HEADER = "MCP-Session-Id";

export const MCP_LAST_EVENT_ID_HEADER = "Last-Event-ID";

export const SSE_ACCEPT_HEADER = "text/event-stream";

export const NOTIFICATIONS = {
  TOOLS_LIST_CHANGED: "notifications/tools/list_changed",
  PROMPTS_LIST_CHANGED: "notifications/prompts/list_changed",
  RESOURCES_LIST_CHANGED: "notifications/resources/list_changed",
  PROGRESS: "notifications/progress",
  INITIALIZED: "notifications/initialized",
  CANCELLED: "notifications/cancelled",
} as const;
