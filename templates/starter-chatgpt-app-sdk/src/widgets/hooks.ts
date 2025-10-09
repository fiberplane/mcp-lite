import { useSyncExternalStore, useState, useEffect, useCallback } from "react";
import type { OpenAiGlobals, SetGlobalsEvent } from "./openai-types";
import { SET_GLOBALS_EVENT_TYPE, getOpenAI } from "./openai-types";

type UnknownObject = Record<string, unknown>;

/**
 * Hook to subscribe to a specific OpenAI global value
 * Automatically re-renders when the subscribed value changes
 */
export function useOpenAiGlobal<K extends keyof OpenAiGlobals>(
  key: K,
): OpenAiGlobals[K] {
  return useSyncExternalStore(
    (onChange) => {
      const handleSetGlobal = (event: Event) => {
        const setGlobalsEvent = event as SetGlobalsEvent;
        const value = setGlobalsEvent.detail?.globals[key];

        // Only trigger re-render if this specific value changed
        if (value === undefined) return;

        onChange();
      };

      window.addEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal, {
        passive: true,
      });

      return () => {
        window.removeEventListener(SET_GLOBALS_EVENT_TYPE, handleSetGlobal);
      };
    },
    () => window.openai[key],
  );
}

/**
 * Hook to get the tool output
 * Returns null if no tool output is available
 */
export function useToolOutput<T = UnknownObject>(): T | null {
  return useOpenAiGlobal("toolOutput") as T | null;
}

/**
 * Hook to get the current theme (light or dark)
 */
export function useTheme(): "light" | "dark" {
  return useOpenAiGlobal("theme");
}

/**
 * Hook to get the tool input
 */
export function useToolInput<T = UnknownObject>(): T {
  return useOpenAiGlobal("toolInput") as T;
}

/**
 * Hook to get tool response metadata
 */
export function useToolResponseMetadata<T = UnknownObject>(): T | null {
  return useOpenAiGlobal("toolResponseMetadata") as T | null;
}

/**
 * Hook to get the current display mode
 */
export function useDisplayMode(): "pip" | "inline" | "fullscreen" {
  return useOpenAiGlobal("displayMode");
}

/**
 * Hook to get the current locale
 */
export function useLocale(): string {
  return useOpenAiGlobal("locale");
}

/**
 * Hook to manage widget state synchronized with the host
 * This allows state persistence and sharing with ChatGPT
 */
export function useWidgetState<T extends UnknownObject>(
  defaultState: T | (() => T),
): readonly [T, (state: React.SetStateAction<T>) => void] {
  const widgetStateFromWindow = useOpenAiGlobal("widgetState") as T | null;

  const [widgetState, _setWidgetState] = useState<T>(() => {
    return (
      widgetStateFromWindow ??
      (typeof defaultState === "function" ? defaultState() : defaultState)
    );
  });

  useEffect(() => {
    if (widgetStateFromWindow) {
      _setWidgetState(widgetStateFromWindow);
    }
  }, [widgetStateFromWindow]);

  const setWidgetState = useCallback(
    (stateOrUpdater: React.SetStateAction<T>) => {
      _setWidgetState((prevState) => {
        const newState =
          typeof stateOrUpdater === "function"
            ? (stateOrUpdater as (prev: T) => T)(prevState)
            : stateOrUpdater;

        // Sync with host
        getOpenAI()?.setWidgetState(newState);

        return newState;
      });
    },
    [],
  );

  return [widgetState, setWidgetState] as const;
}
