import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

const config = [
  ...next, ...coreWebVitals, ...ts,
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
];
export default config;
