import { rm } from "node:fs/promises";
import { URL } from "node:url";

await Promise.all(
  ["../dist", "../demo-dist"].map((path) =>
    rm(new URL(path, import.meta.url), {
      force: true,
      recursive: true,
    }),
  ),
);
