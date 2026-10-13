/**
 * Familee - checks the message catalogues
 *
 * Every human-readable string lives in messages/*.json. The catalogues must
 * have exactly the same keys and no empty values, so that a language never
 * shows a blank label. Run it with `npm run test:i18n`.
 *
 * The script has no dependencies on purpose: it runs on a bare Node.js.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locales = ["ru", "en"];

/** Turns nested objects into a flat map: { "events.birth": "Birth", ... }. */
function flatten(node, prefix = "", out = {}) {
    for (const [key, value] of Object.entries(node)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object") {
            flatten(value, full, out);
        } else {
            out[full] = value;
        }
    }
    return out;
}

const catalogues = Object.fromEntries(
    locales.map((locale) => {
        const text = readFileSync(join(root, "messages", `${locale}.json`), "utf8");
        return [locale, flatten(JSON.parse(text))];
    }),
);

const allKeys = new Set(locales.flatMap((locale) => Object.keys(catalogues[locale])));
const problems = [];

for (const key of [...allKeys].sort()) {
    for (const locale of locales) {
        if (!(key in catalogues[locale])) {
            problems.push(`${locale}: missing key "${key}"`);
        }
    }
}

for (const locale of locales) {
    for (const [key, value] of Object.entries(catalogues[locale])) {
        if (typeof value !== "string" || value.trim() === "") {
            problems.push(`${locale}: empty or non-text value at "${key}"`);
        }
    }
}

if (problems.length > 0) {
    console.error(problems.join("\n"));
    process.exit(1);
}

console.log(`messages: ${locales.join(", ")} - ${allKeys.size} keys, no gaps`);
