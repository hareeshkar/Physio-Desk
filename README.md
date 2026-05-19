# Physio Love Notes

A personal study app for generating source-grounded physiotherapy MCQs and short essay questions from uploaded notes.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev:vercel
```

`npm run dev:vercel` runs the Vite app and `/api/*` serverless routes together (use this for generate/verify). `npm run dev` is UI-only.

Deployed on **Vercel Hobby** (`/api/*`, up to 300s per function). Set `MINIMAX_API_KEY` and `GEMINI_API_KEY` in the Vercel project settings.

## Deploy (Vercel)

```bash
npx vercel link
npx vercel env pull .env.local
npx vercel --prod
```

After deploy, generate a quiz from the GI PDF in the browser. Functions allow ~120s for `generate-quiz` (smoke test: ~37s for 2 MCQs).

## Gemini

- Default model: `gemini-3-flash-preview`
- File Search embedding model: `models/gemini-embedding-2`
- The browser never receives the Gemini API key.
- Uploaded files and study history are stored locally in IndexedDB.

## Verification

```bash
npm test
npm run build
npm run smoke:gi
```
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
