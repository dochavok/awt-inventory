// Lint settings. The restricted imports enforce TF-4 (every test goes through the
// tagging wrapper) and TF-2 (the rules core stays pure).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const untaggedTests = {
  paths: [
    {
      name: "vitest",
      importNames: ["it", "test"],
      message: "Use rule() from tests/support/rule.ts so the test names its requirements (TF-4).",
    },
    {
      name: "@playwright/test",
      importNames: ["test"],
      message: "Use browserRule() from tests/support/browser-rule.ts (TF-4).",
    },
  ],
};

// NF-4: the reference data comes built in, so the code that runs in the browser never imports a
// YAML parser, a schema checker, the data loader or the build's own code (which imports them).
const buildTimeOnly = (message) => ({
  group: ["yaml", "yaml/*", "zod", "zod/*", "**/refdata", "**/refdata/**", "**/build/**"],
  message,
});
const noBuildTimeImports = {
  // A dynamic import() would still be bundled, as a chunk of its own.
  selector: "ImportExpression[source.value=/^(yaml|zod)($|\\u002F)|refdata|build\\u002F/]",
  message: "The reference data is read at build time (NF-4): import it from virtual:reference-data.",
};

export default tseslint.config(
  {
    ignores: ["node_modules/", "dist/", "coverage/", "var/", "playwright-report/", "test-results/", "functions/lib/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.ts"],
    ignores: ["tests/support/**"],
    rules: { "no-restricted-imports": ["error", untaggedTests] },
  },
  {
    files: ["src/rules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["firebase", "firebase/*", "@firebase/*"],
              message: "The rules core has no Firebase code (TF-2).",
            },
            { group: ["react", "react-dom", "react/*"], message: "The rules core has no UI code (TF-2)." },
            { group: ["**/data/**", "**/platform/**", "**/app/**"], message: "The rules core is pure (TF-2)." },
            buildTimeOnly("The reference data is read at build time (NF-4): the rules get it passed in."),
          ],
        },
      ],
      "no-restricted-syntax": ["error", noBuildTimeImports],
    },
  },
  {
    // The rest of the browser's code (NF-4). src/rules has the same rule in its TF-2 block above,
    // since a second block for it would replace that one.
    files: ["src/{app,data,platform}/**/*.{ts,tsx}", "src/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            buildTimeOnly("The reference data is read at build time (NF-4): import it from virtual:reference-data."),
          ],
        },
      ],
      "no-restricted-syntax": ["error", noBuildTimeImports],
    },
  },
);
