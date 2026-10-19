import globals from 'globals';
export default [
  { ignores: ['node_modules/**', '_site/**', '.test-output/**', '.wrangler/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: {
      ...globals.browser, ...globals.node, HTMLRewriter: 'readonly',
    } },
    rules: {
      'no-undef': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error',
      'no-unreachable': 'error', 'no-constant-condition': ['error', { checkLoops: false }],
      'no-unsafe-finally': 'error', 'no-unsafe-optional-chaining': 'error',
      'constructor-super': 'error', 'valid-typeof': 'error', 'no-eval': 'error',
      'no-implied-eval': 'error', 'no-new-func': 'error', 'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },
];
