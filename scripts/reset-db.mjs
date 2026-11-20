#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const files = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir).filter((file) => file.startsWith("openpos.sqlite"))
  : [];

for (const file of files) {
  fs.rmSync(path.join(dataDir, file), { force: true });
  console.log(`removed data/${file}`);
}

console.log("Database reset. Seed data will be recreated on the next request.");
