const fs = require("fs");
const path = require("path");

// Copy the current regex from app.js (updated)
const BLOCK_RE =
  /^###\s*(?:\*\*)?Câu\s*(\d+)\s*(?:\*\*)?[\s\S]*?(?=^###\s*(?:\*\*)?Câu|^---+\s*$|\Z)/gim;
const OPT_RE = /^[ \t]*([a-z])\.\s*(.+)$/gim;

const file = path.resolve(__dirname, "..", "data", "questions1.txt");
const raw = fs.readFileSync(file, "utf8");

console.log("=== Testing parser on questions1.txt ===");
console.log("File length:", raw.length);

// Test BLOCK_RE
const blocks = raw.match(BLOCK_RE) || [];
console.log("Total blocks found:", blocks.length);

// Test first 3 blocks
for (let i = 0; i < Math.min(3, blocks.length); i++) {
  const block = blocks[i].trim();
  console.log(`\n--- Block ${i + 1} ---`);
  console.log("First line:", block.split("\n")[0]);

  // Test options in this block
  const noTitle = block.replace(/^###\s*(?:\*\*)?Câu[^\n]*\n*/i, "");
  const options = [];
  let om;
  OPT_RE.lastIndex = 0; // reset regex
  while ((om = OPT_RE.exec(noTitle)) !== null) {
    options.push({ key: om[1], text: om[2].trim() });
  }
  console.log(`Options found: ${options.length}`);
  options.forEach((opt) =>
    console.log(`  ${opt.key}. ${opt.text.slice(0, 50)}...`)
  );

  // Check for answer line (updated to handle ** bold **)
  const ansMatch = noTitle.match(
    /^[^\S\r\n]*\*{0,2}➡️[^\n]*:\s*(.+?)\*{0,2}$/im
  );
  if (ansMatch) {
    console.log(`Answer: ${ansMatch[1]}`);
  } else {
    console.log("No answer found");
  }
}
