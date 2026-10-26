import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig(
  { ignores: ["dist", "node_modules", "samples", ".astro"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["scripts/**", "astro.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
