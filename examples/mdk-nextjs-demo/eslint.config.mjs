import nextConfig from "eslint-config-next";

const config = [
  {
    ignores: ["node_modules/**", ".next/**"],
  },
  ...nextConfig,
];

export default config;
