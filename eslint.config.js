// @ts-check
import eslint from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import { config as defineConfig, configs as tsConfigs } from "typescript-eslint";

const NO_RELATIVE_IMPORTS = { regex: "^\\.\\.?/", message: "Use #-imports inside the engine." };
const NO_OWN_BARREL_IMPORTS = {
  regex: "^(#index|@deepdive/engine)$",
  message: "Import from the source module that defines it, not the engine's own barrel.",
};

export default defineConfig(
  // Never linted: build output and Next's generated ambient types.
  { ignores: ["**/.next/**", "**/next-env.d.ts"] },

  eslint.configs.recommended,
  ...tsConfigs.recommendedTypeChecked,
  importX.recommended,
  importX.typescript,

  // Config files live outside every TS project by design; typed rules would
  // see error-typed values everywhere (e.g. import.meta.dirname without Node
  // types). Boundary and dependency rules below still apply to them.
  {
    files: ["**/*.config.{js,ts}", "eslint.config.js"],
    extends: [tsConfigs.disableTypeChecked],
  },

  {
    languageOptions: {
      parserOptions: {
        // Every linted file is assigned to the TS project that owns it. Root-level
        // config files belong to no project (the 0.1 `include: ["./src"]` gap) —
        // allowDefaultProject is typescript-eslint's designed escape hatch for them.
        projectService: {
          allowDefaultProject: ["*.config.js", "*.config.ts", "eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      // The default Node resolver cannot follow `exports` maps or pnpm symlinks;
      // without this, @deepdive/* specifiers never resolve and every zone below
      // silently matches nothing. Falsified by the typo check.
      "import-x/resolver-next": [createTypeScriptImportResolver()],
    },
    rules: {
      // The boundary matrix from docs/decisions/0002-scope-audit.md.
      // Semantics: files in `target` may not import from `from`.
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./packages/engine",
              from: "./packages",
              except: ["./engine"],
              message: "The engine imports nothing from other packages (ADR 0002).",
            },
            {
              target: "./packages/db",
              from: "./packages",
              except: ["./db"],
              message: "db never imports the engine: the transaction helper receives apply as a callback (ADR 0002).",
            },
            {
              target: "./packages",
              from: "./apps",
              message: "Packages never import app code (ADR 0002).",
            },
            // One zone per app: each may import packages, never a sibling app.
            // apps/react-router and apps/tanstack get their zones at 6.1 and 7.1.
            {
              target: "./apps/next",
              from: "./apps",
              except: ["./next"],
              message: "Apps never import other apps — it would void the comparison (ADR 0002).",
            },
          ],
        },
      ],

      // The phantom-dependency rule from 0.2: every import must be declared in the
      // importing package's own package.json. Test and config files may use devDependencies.
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: ["**/*.test.ts", "**/*.test.tsx", "**/*.config.js", "**/*.config.ts", "eslint.config.js"],
        },
      ],
    },
  },

  // Inside the engine every internal import goes through the #-subpath map
  // declared in its package.json; relative specifiers are forbidden, and so is
  // reaching for the engine's own barrel instead of the defining module.
  {
    files: ["packages/engine/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_RELATIVE_IMPORTS, NO_OWN_BARREL_IMPORTS] }],
    },
  },

  // The barrel's own test is the one file that must import the barrel.
  {
    files: ["packages/engine/src/index.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_RELATIVE_IMPORTS] }],
    },
  },
);
