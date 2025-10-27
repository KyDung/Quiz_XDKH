const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "..", "data");
const outFile = path.join(dataDir, "sets.json");

function buildSets() {
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.toLowerCase().endsWith(".txt"))
    .sort();

  const sets = files.map((f) => ({
    id: path.basename(f, path.extname(f)),
    label: f,
    file: `./data/${f}`,
  }));

  fs.writeFileSync(outFile, JSON.stringify(sets, null, 2), "utf8");
  console.log(`Wrote ${sets.length} sets to ${outFile}`);
}

try {
  buildSets();
} catch (err) {
  console.error("Failed to generate sets.json", err);
  process.exit(1);
}
