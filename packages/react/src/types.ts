/**
 * Type definitions for OpenAI Apps SDK window.openai API
 * Minimal subset for mcp-lite compatibility
 */

export type Theme = "light" | "dark";
export type DisplayMode = "pip" | "inline" | "fullscreen";

export interface CallToolResponse {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: unknown;
  }>;
  isError?: boolean;
}

/**
 * OpenAI Apps SDK global API surface
 */
export interface WindowOpenAI<TState = unknown> {
  // Layout & theme globals
  theme?: Theme;
  displayMode?: DisplayMode;
  locale?: string;

  // Input from tool invocation
  toolInput?: unknown;

  // Output from tool if available
  toolOutput?: unknown;

  // Persistent widget state
  widgetState?: TState;

  // API methods
  callTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResponse>;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
  openExternal?: (args: { href: string }) => void;
  requestDisplayMode?: (args: {
    mode: DisplayMode;
  }) => Promise<{ mode: DisplayMode }>;
  setWidgetState?: (state: TState) => Promise<void>;
}

declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: Generic state type for window.openai
    openai?: WindowOpenAI<any>;
  }
}

/**
 * Result type for the useWidget hook
 */
export interface UseWidgetResult<
  TProps = Record<string, unknown>,
  TState = unknown,
> {
  // Props from tool invocation
  props: TProps;

  // Layout and theme
  theme: Theme;
  displayMode: DisplayMode;
  locale: string;

  // Widget state
  state: TState | null;
  setState: (
    state: TState | ((prev: TState | null) => TState),
  ) => Promise<void>;

  // Actions
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResponse>;
  sendFollowUpMessage: (prompt: string) => Promise<void>;
  openExternal: (href: string) => void;
  requestDisplayMode: (mode: DisplayMode) => Promise<{ mode: DisplayMode }>;

  // Availability
  isAvailable: boolean;
}
