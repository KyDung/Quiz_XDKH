const fs = require("fs");
const path = require("path");

const p = path.resolve(__dirname, "..", "data", "questions.txt");
const raw = fs.readFileSync(p, "utf8");

// Keep in sync with updated app.js BLOCK_RE
const BLOCK_RE =
  /^###\s*(?:\*\*)?Câu\s*(\d+)\s*(?:\*\*)?[\s\S]*?(?=^###\s*(?:\*\*)?Câu|\Z)/gim;
const matches = raw.match(BLOCK_RE) || [];
console.log("File:", p);
console.log("Raw length:", raw.length);
console.log("Blocks matched by BLOCK_RE:", matches.length);

// Quick heuristic: also count any lines that start with "###" and contain "Câu"
const lines = raw.split(/\r?\n/);
const headingCount = lines.filter((l) => /^###.*\bCâu\b/i.test(l)).length;
console.log('Lines starting with ### and containing "Câu":', headingCount);

// Show first 5 matched headings for manual inspection
console.log("\nFirst 5 matched headings (trimmed):");
for (let i = 0; i < Math.min(5, matches.length); i++) {
  const h = matches[i].split(/\r?\n/)[0];
  console.log(i + 1, h.trim());
}
