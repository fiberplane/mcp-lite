import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { ItemListWidget } from "./components/ItemListWidget";
import { ItemDetailWidget } from "./components/ItemDetailWidget";
import { LoadingWidget } from "./components/LoadingWidget";
import { NavigationSync } from "./NavigationSync";

function RootComponent() {
  return (
    <>
      <NavigationSync />
      <Outlet />
    </>
  );
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

const routeTree = rootRoute.addChildren([
  loadingRoute,
  listRoute,
  detailRoute,
]);

export const router = createRouter({ routeTree });

// Type registration for full type inference throughout the app
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Export route objects for type-safe navigation
export { listRoute, detailRoute };
