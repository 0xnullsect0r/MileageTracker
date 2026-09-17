import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest runs Node modules unbundled, so `import "server-only"` throws the
// package's guard. The shim in scripts/ makes those imports no-ops in tests
// so pure helpers stay testable without leaking server code to the client.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./scripts/server-only-shim.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
