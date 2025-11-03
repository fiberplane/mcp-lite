/**
 * React hook for mcp-lite UI widgets
 * Connects to window.openai.toolInput injected by server
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  CallToolResponse,
  DisplayMode,
  Theme,
  UseWidgetResult,
} from "./types.js";

// Event type for window.openai global changes
const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

/**
 * Hook to subscribe to a single value from window.openai globals
 * Uses React 18's useSyncExternalStore for efficient subscriptions
 */
function useOpenAiGlobal<K extends keyof NonNullable<typeof window.openai>>(
  key: K,
): NonNullable<typeof window.openai>[K] | undefined {
  return useSyncExternalStore(
    (onChange) => {
      const handleSetGlobal = (event: Event) => {
        const customEvent = event as CustomEvent<{
          globals: Partial<NonNullable<typeof window.openai>>;
        }>;
        const value = customEvent.detail?.globals[key];
        if (value !== undefined) {
          onChange();
        }
      };

      if (typeof window !== "undefined") {
        window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      }

      return () => {
        if (typeof window !== "undefined") {
          window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
        }
      };
    },
    () =>
      typeof window !== "undefined" && window.openai
        ? window.openai[key]
        : undefined,
  );
}

/**
 * React hook for building widgets with mcp-lite uiResource()
 *
 * Automatically reads props from window.openai.toolInput (injected by the server)
 * and provides APIs for interacting with the MCP client.
 *
 * @example Basic usage
 * ```tsx
 * import { useWidget } from "@mcp-lite/react";
 *
 * interface MyProps {
 *   city: string;
 *   temperature: number;
 * }
 *
 * export default function WeatherWidget() {
 *   const { props, theme } = useWidget<MyProps>();
 *
 *   return (
 *     <div data-theme={theme}>
 *       <h1>{props.city}</h1>
 *       <p>{props.temperature}°C</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example With default props
 * ```tsx
 * const { props } = useWidget<MyProps>({ city: "Unknown", temperature: 0 });
 * ```
 */
export function useWidget<TProps = Record<string, unknown>, TState = unknown>(
  defaultProps?: TProps,
): UseWidgetResult<TProps, TState> {
  // Check if window.openai is available
  const isAvailable = typeof window !== "undefined" && !!window.openai;

  // Subscribe to reactive globals using useSyncExternalStore
  const toolInput = useOpenAiGlobal("toolInput") as TProps | undefined;
  const widgetState = useOpenAiGlobal("widgetState") as TState | undefined;
  const theme = useOpenAiGlobal("theme") as Theme | undefined;
  const displayMode = useOpenAiGlobal("displayMode") as DisplayMode | undefined;
  const locale = useOpenAiGlobal("locale") as string | undefined;

  // Local state management with sync from window.openai
  const [localState, setLocalState] = useState<TState | null>(
    widgetState ?? null,
  );

  // Sync widget state from window.openai when it changes
  useEffect(() => {
    if (widgetState !== undefined) {
      setLocalState(widgetState);
    }
  }, [widgetState]);

  // Stable API methods
  const callTool = useCallback(
    async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<CallToolResponse> => {
      if (typeof window === "undefined" || !window.openai?.callTool) {
        throw new Error("window.openai.callTool is not available");
      }
      return window.openai.callTool(name, args);
    },
    [],
  );

  const sendFollowUpMessage = useCallback(
    async (prompt: string): Promise<void> => {
      if (
        typeof window === "undefined" ||
        !window.openai?.sendFollowUpMessage
      ) {
        throw new Error("window.openai.sendFollowUpMessage is not available");
      }
      return window.openai.sendFollowUpMessage({ prompt });
    },
    [],
  );

  const openExternal = useCallback((href: string): void => {
    if (typeof window === "undefined" || !window.openai?.openExternal) {
      throw new Error("window.openai.openExternal is not available");
    }
    window.openai.openExternal({ href });
  }, []);

  const requestDisplayMode = useCallback(
    async (mode: DisplayMode): Promise<{ mode: DisplayMode }> => {
      if (typeof window === "undefined" || !window.openai?.requestDisplayMode) {
        throw new Error("window.openai.requestDisplayMode is not available");
      }
      return window.openai.requestDisplayMode({ mode });
    },
    [],
  );

  const setState = useCallback(
    async (
      stateOrUpdater: TState | ((prevState: TState | null) => TState),
    ): Promise<void> => {
      const newState =
        typeof stateOrUpdater === "function"
          ? (stateOrUpdater as (prevState: TState | null) => TState)(localState)
          : stateOrUpdater;

      if (typeof window === "undefined" || !window.openai?.setWidgetState) {
        // Fallback: just update local state if API not available
        setLocalState(newState);
        return;
      }

      setLocalState(newState);
      return window.openai.setWidgetState(newState);
    },
    [localState],
  );

  return {
    // Props from tool invocation (with fallback to defaults)
    props: (toolInput ?? defaultProps ?? {}) as TProps,

    // Layout and theme (with safe defaults)
    theme: theme ?? "light",
    displayMode: displayMode ?? "inline",
    locale: locale ?? "en",

    // State
    state: localState,
    setState,

    // Actions
    callTool,
    sendFollowUpMessage,
    openExternal,
    requestDisplayMode,

    // Availability
    isAvailable,
  };
}

/**
 * Hook to get just the widget props (most common use case)
 *
 * @example
 * ```tsx
 * const props = useWidgetProps<{ city: string }>();
 * ```
 */
export function useWidgetProps<TProps = Record<string, unknown>>(
  defaultProps?: TProps,
): TProps {
  const { props } = useWidget<TProps>(defaultProps);
  return props;
}

/**
 * Hook to get theme value
 *
 * @example
 * ```tsx
 * const theme = useWidgetTheme();
 * const bgColor = theme === "dark" ? "bg-gray-900" : "bg-white";
 * ```
 */
export function useWidgetTheme(): Theme {
  const { theme } = useWidget();
  return theme;
}

/**
 * Hook to get and update widget state
 *
 * @example
 * ```tsx
 * const [favorites, setFavorites] = useWidgetState<string[]>([]);
 * ```
 */
export function useWidgetState<TState = unknown>(
  defaultState?: TState,
): readonly [
  TState | null,
  (state: TState | ((prev: TState | null) => TState)) => Promise<void>,
] {
  const { state, setState } = useWidget<Record<string, unknown>, TState>();

  // Initialize with default if provided and state is null
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only initialize once on mount
  useEffect(() => {
    if (
      state === null &&
      defaultState !== undefined &&
      typeof window !== "undefined" &&
      window.openai?.setWidgetState
    ) {
      setState(defaultState);
    }
  }, []); // Only run once on mount

  return [state, setState] as const;
}
