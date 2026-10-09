import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      "coverage/",
      "dist/",
      ".claude/",
      ".designs/",
      "scripts/uld/",
      "**/generated/**",
    ],
  },
  {
    files: ["packages/**/*.ts", "apps/**/*.ts", "apps/**/*.tsx", "tests/**/*.ts", "scripts/*.ts"],
    extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "no-restricted-exports": ["error", { restrictDefaultExports: { direct: true } }],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "memberLike",
          modifiers: ["private"],
          format: null,
          custom: { regex: "^_", match: false },
        },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
  {
    files: ["apps/**/*.tsx"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
  },
  {
    // meta・設定の default export が要るファイル
    files: ["apps/web/**/*.stories.tsx", "apps/web/.storybook/*.ts", "apps/web/vite.config.ts"],
    rules: { "no-restricted-exports": "off" },
  },
  {
    files: ["eslint.config.js", "vitest.config.ts", "tests/vitest.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { "no-restricted-exports": "off" },
  },
);
