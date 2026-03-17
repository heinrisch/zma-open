import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          "selector": "import",
          "format": ["camelCase", "PascalCase"]
        }
      ],
      "curly": "warn",
      "eqeqeq": "warn",
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "semi": "warn",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-useless-escape": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
      "block-spacing": ["warn", "always"],
      "object-curly-spacing": ["warn", "always"]
    },
  },
  {
    ignores: [
      "out/",
      "dist/",
      "**/*.d.ts",
    ],
  }
);
