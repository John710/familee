/**
 * Familee - making `@/...` mean `src/...` for the unit tests
 *
 * The application is compiled by Next.js, which reads the alias from tsconfig.json. A unit test runs
 * under plain Node, which does not, so the same prefix is resolved here: the hook is registered when
 * the test runner loads this file (`node --import ./tests/loader.mjs --test tests/`).
 */

import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

        const base = path.join(root, "src", specifier.slice(2));
        for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
            if (existsSync(candidate)) {
                return { url: pathToFileURL(candidate).href, shortCircuit: true };
            }
        }
        return nextResolve(specifier, context);
    },
});
