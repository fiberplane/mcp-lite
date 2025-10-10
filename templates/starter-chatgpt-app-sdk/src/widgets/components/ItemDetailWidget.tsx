import type { Item } from "../../types";
import { useTheme, useToolOutput } from "../hooks";
import { getOpenAI } from "../openai-types";

export function ItemDetailWidget() {
  const item = useToolOutput<Item>();
  const theme = useTheme();
  const isDark = theme === "dark";

  async function handleBackToList() {
    await getOpenAI()?.sendFollowUpMessage({
      prompt: "Show me all items",
    });
  }

  if (!item) {
    return (
      <div
        className={`p-6 rounded-lg max-w-2xl ${isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}
      >
        <div className="flex flex-col items-center justify-center py-12">
          <div
            className={`w-12 h-12 border-4 rounded-full animate-spin ${
              isDark
                ? "border-blue-700 border-t-blue-300"
                : "border-blue-500 border-t-blue-200"
            }`}
          />
          <p
            className={`mt-4 text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}
          >
            Loading item...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-6 rounded-lg max-w-2xl ${isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}
    >
      <h2 className="text-3xl font-semibold mb-2">{item.title}</h2>
      <p
        className={`text-base mb-6 ${isDark ? "text-gray-300" : "text-gray-600"}`}
      >
        {item.description}
      </p>

      <div className="grid gap-4 mb-6">
        <div>
          <div
            className={`text-xs font-semibold tracking-wider mb-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}
          >
            ID
          </div>
          <div className="text-sm font-mono">{item.id}</div>
        </div>

        <div>
          <div
            className={`text-xs font-semibold tracking-wider mb-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}
          >
            CREATED
          </div>
          <div className="text-sm">
            {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleBackToList}
        className={`px-5 py-2.5 text-sm rounded transition-colors ${
          isDark
            ? "bg-gray-800 text-gray-200 hover:bg-gray-700"
            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
        }`}
      >
        ← Back to List
      </button>
    </div>
  );
}
