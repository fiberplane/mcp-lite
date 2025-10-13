import { getOpenAI } from "../openai-types";

export function LoadingWidget() {
  const isDark = getOpenAI()?.theme === "dark";

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
          Loading...
        </p>
      </div>
    </div>
  );
}
