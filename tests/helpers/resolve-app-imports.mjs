import { extname } from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/server") {
    return nextResolve("next/server.js", context);
  }

  const isRelative = specifier.startsWith(".") || specifier.startsWith("/");
  const hasExtension = extname(specifier) !== "";

  if (isRelative && !hasExtension) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      try {
        return await nextResolve(`${specifier}.jsx`, context);
      } catch {
        // Fall through to default resolution.
      }
    }
  }

  return nextResolve(specifier, context);
}
