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

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "coverage/", "var/", "playwright-report/", "test-results/"] },
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
          ],
        },
      ],
    },
  },
);
