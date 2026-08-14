import { copyFile } from "node:fs/promises";
import { URL } from "node:url";

await copyFile(
  new URL("../src/style.css", import.meta.url),
  new URL("../dist/style.css", import.meta.url),
);
