const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const demo2Path = path.join(
  __dirname,
  "..",
  "prototype",
  "demos",
  "帝国的代价-微信小游戏demo2.html"
);
const digest = crypto
  .createHash("sha1")
  .update(fs.readFileSync(demo2Path))
  .digest("hex");

assert.equal(
  digest,
  "7a3fc0692ae10cca4dad440e6ffd82d7031ddfed",
  "Demo2 已冻结，禁止修改"
);

console.log("demo2 freeze baseline passed");
