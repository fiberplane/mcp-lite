import type { ResourceVars } from "./types.js";

export interface UriMatcher {
  match: (uri: string) => ResourceVars | null;
  type: "resource" | "resource_template";
}

/**
 * Compiles a URI template into a matcher function.
 * Supports Hono-style path parameters: {name}, {name*}, and query groups {?a,b,c}
 */
export function compileUriTemplate(template: string): UriMatcher {
  const isStatic = !template.includes("{");

  if (isStatic) {
    return {
      match: (uri: string) => (uri === template ? {} : null),
      type: "resource",
    };
  }

  // Extract query parameter group if present: {?param1,param2}
  const queryMatch = template.match(/\{\?([^}]+)\}/);
  const queryParams = queryMatch?.[1]
    ? queryMatch[1].split(",").map((p) => p.trim())
    : [];

  // Remove query group from template for path matching
  const pathTemplate = template.replace(/\{\?[^}]+\}/, "");

  // Convert path template to regex
  // Escape special regex characters except our placeholders
  let escapedTemplate = pathTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Convert placeholders to regex groups
  escapedTemplate = escapedTemplate
    .replace(/\\{([^}*]+)\\*\\}/g, "(?<$1>.*)") // {name*} -> greedy capture
    .replace(/\\{([^}]+)\\}/g, "(?<$1>[^/?]+)"); // {name} -> non-greedy capture (allow query params)

  const regex = new RegExp(`^${escapedTemplate}$`);

  return {
    match: (uri: string) => {
      try {
        // For templates with query params, match against the path part only
        const [pathPart] = uri.split("?");
        const matchTarget = queryParams.length > 0 ? (pathPart ?? uri) : uri;

        const pathMatch = matchTarget.match(regex);

        if (!pathMatch) return null;

        const vars: ResourceVars = { ...pathMatch.groups };

        // Extract query parameters if specified in template
        if (queryParams.length > 0) {
          try {
            const url = new URL(uri);
            for (const param of queryParams) {
              const value = url.searchParams.get(param);
              if (value !== null) {
                vars[param] = value;
              }
            }
          } catch {
            // If URL parsing fails, skip query params extraction
          }
        }

        return vars;
      } catch {
        return null;
      }
    },
    type: "resource_template",
  };
}
