import { defineConfig } from "vite";

// GitHub Pages ( https://ayakaMochizuk.github.io/cg-modeling/ ) で
// 正しくアセットを読み込めるよう、リポジトリ名をbaseに設定する
export default defineConfig({
  base: "/cg-modeling/",
});
