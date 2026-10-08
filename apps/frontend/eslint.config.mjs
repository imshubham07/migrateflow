import tseslint from "typescript-eslint";

export default tseslint.config({
  ignores: [".next/**"],
  extends: [...tseslint.configs.recommended],
});
