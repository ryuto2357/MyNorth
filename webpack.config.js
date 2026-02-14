import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: {
    login: "./src/login.js",
    index: "./src/index.js",
    dashboard: "./src/dashboard.js",
    intro: "./src/intro.js",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "public", "js"),
    clean: true,
  },
};