const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "prototype", "demos", "帝国的代价-微信小游戏demo2.html");
const outputPath = path.join(root, "assets", "ui", "prototype-map-data.js");
const source = fs.readFileSync(sourcePath, "utf8");

function extractConst(name) {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`未找到 ${name}`);
  let cursor = start + marker.length;
  while (/\s/.test(source[cursor])) cursor += 1;
  const opener = source[cursor];
  const closer = opener === "[" ? "]" : opener === "{" ? "}" : null;
  if (!closer) throw new Error(`${name} 不是数组或对象`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = cursor; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return source.slice(cursor, index + 1);
  }
  throw new Error(`${name} 没有闭合`);
}

const names = [
  "landPolygons",
  "seaPolygons",
  "labels",
  "regionSeeds",
  "CITY_BY_REGION",
  "CAPITAL_BY_POLITY",
  "CITY_COORDS"
];

const body = names.map(name => `  ${name}: ${extractConst(name)}`).join(",\n");
const output = `/* Generated from demo2 by scripts/extract-prototype-map-data.cjs. */\nwindow.PROTOTYPE_MAP_DATA = {\n${body}\n};\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`wrote ${path.relative(root, outputPath)}`);
