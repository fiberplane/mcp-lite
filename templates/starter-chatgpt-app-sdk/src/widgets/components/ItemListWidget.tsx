import type { Item } from "../../types";
import { getOpenAI } from "../openai-types";
import { useToolOutput, useTheme } from "../hooks";

export function ItemListWidget() {
  const data = useToolOutput<{ items?: Item[] }>();
  const theme = useTheme();
  const items = data?.items || [];
  const isDark = theme === "dark";

  async function handleViewDetails(item: Item) {
    await getOpenAI()?.sendFollowUpMessage({
      prompt: `Show me details for item "${item.title}"`,
    });
  }

  if (!data) {
    return (
      <div
        className={`p-6 rounded-lg max-w-3xl ${isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}
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
            Loading items...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-6 rounded-lg max-w-3xl ${isDark ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}
    >
      <h2 className="text-2xl font-semibold mb-6">Items ({items.length})</h2>

      {items.length === 0 ? (
        <div
          className={`text-center py-12 ${isDark ? "text-gray-500" : "text-gray-400"}`}
        >
          <p>No items yet. Try adding one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => handleViewDetails(item)}
              className={`p-4 rounded cursor-pointer transition-all ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-750 hover:shadow-lg"
                  : "bg-gray-50 hover:bg-gray-100 hover:shadow-lg"
              }`}
            >
              <h3 className="text-lg font-semibold mb-1">{item.title}</h3>
              <p
                className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}
              >
                {item.description}
              </p>
              <div
                className={`text-xs mt-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {new Date(item.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
