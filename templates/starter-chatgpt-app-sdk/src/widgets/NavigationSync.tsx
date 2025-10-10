import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { WidgetState } from "../types";
import { useToolOutput } from "./hooks";

export function NavigationSync() {
  const data = useToolOutput<WidgetState>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!data) {
      navigate({ to: "/" });
      return;
    }

    switch (data.kind) {
      case "item_list":
        navigate({ to: "/list" });
        break;

      case "item_detail":
        navigate({
          to: "/detail/$itemId",
          params: { itemId: data.id },
        });
        break;
    }
  }, [data, navigate]);

  // This component doesn't render anything
  return null;
}
