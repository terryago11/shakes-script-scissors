const coreWebVitals = require("eslint-config-next/core-web-vitals");

module.exports = [
  ...coreWebVitals,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "shakedracor/**"],
    rules: {
      // React Compiler rules are only meaningful when the React Compiler is enabled.
      // This project does not use the React Compiler, so these rules are disabled.
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
