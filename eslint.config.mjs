import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const TYPED_TS_GLOB = ["**/*.{ts,tsx,mts,cts}"];
const typedTypeScriptConfigs = tseslint.configs.recommendedTypeChecked
  .slice(1)
  .map((config) => ({
    ...config,
    files: TYPED_TS_GLOB,
  }));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...typedTypeScriptConfigs,
  {
    files: TYPED_TS_GLOB,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Dev / scratch — not part of production deploy
    "scratch/**",
    "test.js",
    "app/test-types.ts",
  ]),
]);

export default eslintConfig;
