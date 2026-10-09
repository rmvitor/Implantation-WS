import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { convertTrello } from "./trello-conversion.mjs";
const [source, destination] = process.argv.slice(2);
if (!source || !destination)
  throw new Error(
    "Uso: node scripts/convert-trello.mjs entrada-trello.json saida-implanta.json",
  );
const { workspace, report } = convertTrello(
  JSON.parse(await readFile(source, "utf8")),
);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(workspace, null, 2) + "\n");
await writeFile(
  destination.replace(/\.json$/i, "") + "-conversao.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
console.log("Arquivo compatível com a importação do Implanta salvo.");
