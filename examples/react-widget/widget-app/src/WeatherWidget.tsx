import { useWidget } from "@mcp-lite/react";
import { useState } from "react";

interface WeatherProps {
  city: string;
  temperature: number;
  weather: "sunny" | "rain" | "snow" | "cloudy";
}

export default function WeatherWidget() {
  const { props, theme, callTool, sendFollowUpMessage, isAvailable } =
    useWidget<WeatherProps>({
      city: "Unknown",
      temperature: 0,
      weather: "cloudy",
    });

  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<string | null>(null);

  const getWeatherIcon = (weatherType: string) => {
    switch (weatherType?.toLowerCase()) {
      case "sunny":
        return "☀️";
      case "rain":
        return "🌧️";
      case "snow":
        return "❄️";
      case "cloudy":
        return "☁️";
      default:
        return "🌤️";
    }
  };

  const getWeatherColor = (weatherType: string) => {
    switch (weatherType?.toLowerCase()) {
      case "sunny":
        return "from-yellow-400 to-orange-500";
      case "rain":
        return "from-blue-400 to-blue-600";
      case "snow":
        return "from-blue-100 to-blue-300";
      case "cloudy":
        return "from-gray-400 to-gray-600";
      default:
        return "from-gray-300 to-gray-500";
    }
  };

  const handleFetchForecast = async () => {
    if (!isAvailable) {
      alert("MCP APIs not available in standalone mode");
      return;
    }

    setLoading(true);
    try {
      const result = await callTool("get-forecast", {
        city: props.city,
        days: 7,
      });
      setForecast(
        result.content.find((c) => c.type === "text")?.text ||
          "No forecast available",
      );
    } catch (error) {
      console.error("Failed to fetch forecast:", error);
      setForecast("Error fetching forecast");
    } finally {
      setLoading(false);
    }
  };

  const handleAskMore = () => {
    if (!isAvailable) {
      alert("MCP APIs not available in standalone mode");
      return;
    }
    sendFollowUpMessage(`Tell me more about the weather in ${props.city}`);
  };

  const bgColor = theme === "dark" ? "bg-gray-900" : "bg-white";
  const textColor = theme === "dark" ? "text-gray-100" : "text-gray-800";
  const cardBg = theme === "dark" ? "bg-gray-800" : "bg-gray-50";

  return (
    <div className={`min-h-screen ${bgColor} ${textColor} p-6`}>
      <div className="max-w-sm mx-auto">
        {/* Weather Card */}
        <div className={`${cardBg} rounded-xl shadow-lg overflow-hidden`}>
          {/* Weather Icon Header */}
          <div
            className={`h-32 bg-gradient-to-br ${getWeatherColor(props.weather)} flex items-center justify-center`}
          >
            <div className="text-6xl">{getWeatherIcon(props.weather)}</div>
          </div>

          {/* Weather Info */}
          <div className="p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">{props.city}</h2>
              <div className="flex items-center justify-center space-x-4">
                <span className="text-4xl font-light">
                  {props.temperature}°
                </span>
                <div className="text-right">
                  <p className="text-lg font-medium capitalize">
                    {props.weather}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        {isAvailable && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleFetchForecast}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Loading..." : "Get 7-Day Forecast"}
            </button>

            <button
              type="button"
              onClick={handleAskMore}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Ask for More Info
            </button>
          </div>
        )}

        {/* Forecast Display */}
        {forecast && (
          <div className={`mt-4 p-4 ${cardBg} rounded-lg`}>
            <h3 className="font-semibold mb-2">7-Day Forecast:</h3>
            <p className="text-sm">{forecast}</p>
          </div>
        )}

        {/* Standalone Mode Notice */}
        {!isAvailable && (
          <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-lg text-sm">
            <p className="font-semibold">Standalone Mode</p>
            <p className="mt-1">
              This widget is running in standalone mode. Deploy it and register
              with an MCP server to enable interactive features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
