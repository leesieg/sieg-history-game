const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "prototype", "hifi");
const requiredFiles = [
  "index.html",
  "styles/tokens.css",
  "styles/layout.css",
  "styles/components.css",
  "scripts/main.js",
  "scripts/data/geography.js",
  "scripts/ui/map.js",
];

for (const relativePath of requiredFiles) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `缺少高保真模块：${relativePath}`
  );
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
for (const reference of [
  "styles/tokens.css",
  "styles/layout.css",
  "styles/components.css",
  "scripts/main.js",
]) {
  assert.ok(html.includes(reference), `入口未引用 ${reference}`);
}

console.log("hifi module structure passed");
