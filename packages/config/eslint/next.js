import baseConfig from './base.js';

/**
 * ESLint config for the Next.js application.
 * Extends the base config and adds Next.js-specific rules.
 */
export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Allow console in server components / route handlers where appropriate
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['**/app/**/page.tsx', '**/app/**/layout.tsx', '**/app/**/error.tsx', '**/app/**/loading.tsx', '**/app/**/not-found.tsx'],
    rules: {
      // Next.js pages/layouts don't need explicit return types
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
