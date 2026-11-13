import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig, globalIgnores } from 'eslint/config';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next already registers the `import` plugin; reuse its recommended rules.
  {
    rules: importPlugin.flatConfigs.recommended.rules,
  },
  // eslint-plugin-react-hooks 7 (via eslint-config-next 16) adds React Compiler rules.
  // The vendored shadcn registry components (overwritten by `pnpm shadcn:install`)
  // trip two of them; report as warnings there instead of patching vendored code.
  {
    files: ['components/agents-ui/**', 'components/ai-elements/**', 'hooks/agents-ui/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  // Includes eslint-config-prettier and must come last.
  prettierRecommended,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);

export default eslintConfig;
