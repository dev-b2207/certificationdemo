import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";
import tseslint from "@typescript-eslint/eslint-plugin";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**"],
    },
    {
        plugins: {
            "@typescript-eslint": tseslint,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "error",
        },
    },
];