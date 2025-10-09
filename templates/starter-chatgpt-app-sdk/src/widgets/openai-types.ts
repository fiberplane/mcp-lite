type UnknownObject = Record<string, unknown>;

export interface OpenAiGlobals<
  ToolInput extends UnknownObject = UnknownObject,
  ToolOutput extends UnknownObject = UnknownObject,
  ToolResponseMetadata extends UnknownObject = UnknownObject,
  WidgetState extends UnknownObject = UnknownObject,
> {
  theme: "light" | "dark";
  userAgent: {
    device: { type: "mobile" | "tablet" | "desktop" | "unknown" };
    capabilities: {
      hover: boolean;
      touch: boolean;
    };
  };
  locale: string;
  maxHeight: number;
  displayMode: "pip" | "inline" | "fullscreen";
  safeArea: {
    insets: {
      top: number;
      bottom: number;
      left: number;
      right: number;
    };
  };
  toolInput: ToolInput;
  toolOutput: ToolOutput | null;
  toolResponseMetadata: ToolResponseMetadata | null;
  widgetState: WidgetState | null;
}

export interface OpenAIWidgetAPI<
  ToolInput extends UnknownObject = UnknownObject,
  ToolOutput extends UnknownObject = UnknownObject,
  ToolResponseMetadata extends UnknownObject = UnknownObject,
  WidgetState extends UnknownObject = UnknownObject,
> extends OpenAiGlobals<ToolInput, ToolOutput, ToolResponseMetadata, WidgetState> {
  setWidgetState: (state: WidgetState) => Promise<void>;
  callTool: (name: string, args: unknown) => Promise<unknown>;
  sendFollowUpMessage: (params: { prompt: string }) => Promise<void>;
}

export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

export interface SetGlobalsEvent extends CustomEvent<{ globals: Partial<OpenAiGlobals> }> {
  type: typeof SET_GLOBALS_EVENT_TYPE;
}

declare global {
  interface Window {
    openai: OpenAIWidgetAPI;
  }

  interface WindowEventMap {
    [SET_GLOBALS_EVENT_TYPE]: SetGlobalsEvent;
  }
}

export function getOpenAI(): OpenAIWidgetAPI | undefined {
  return window.openai;
}
