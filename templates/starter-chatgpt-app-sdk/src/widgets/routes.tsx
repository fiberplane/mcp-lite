import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { ItemDetailWidget } from "./components/ItemDetailWidget";
import { ItemListWidget } from "./components/ItemListWidget";
import { LoadingWidget } from "./components/LoadingWidget";
import { useNavigationSync } from "./hooks";

function RootComponent() {
  useNavigationSync();

  return <Outlet />;
}

const rootRoute = createRootRoute({
  component: RootComponent,
});

const loadingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LoadingWidget,
});

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/list",
  component: ItemListWidget,
});

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/detail/$itemId",
  component: ItemDetailWidget,
});

const routeTree = rootRoute.addChildren([loadingRoute, listRoute, detailRoute]);

export const router = createRouter({ routeTree });

// Type registration for full type inference throughout the app
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Export route objects for type-safe navigation
export { listRoute, detailRoute };
