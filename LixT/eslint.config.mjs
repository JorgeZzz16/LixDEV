// Configuración mínima de ESLint. NO es un linter de estilo: no opina sobre
// comillas, punto y coma ni sangrado. Solo busca las dos cosas que el navegador
// no avisa hasta que revientan en producción:
//
//   · `no-undef`  — una variable que no existe. Es la red que hace seguro partir
//                   App.jsx en archivos: si al mover un componente se te olvida
//                   importar algo, salta aquí y no en tiempo de ejecución.
//   · rules-of-hooks — un hook después de un `return` condicional. Eso rompe el
//                   orden de hooks y tira la app en cuanto cambia la condición.
//
// Uso:  npm run lint

import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

export default [
  {
    files: ["**/*.{js,jsx,mjs}"],
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      "no-undef": "error",
      // Sin esto, `no-unused-vars` no ve los componentes usados en JSX y avisa de
      // todos como si sobraran, que es ruido suficiente para dejar de mirar el linter.
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^React$" }],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
