import * as path from "path";
import * as fs from "fs";

const root = process.cwd();

const pkgPath = path.join(root, "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg.name !== "driver-micro-services") {
    console.error("❌ Wrong project! You are in:", pkg.name);
    process.exit(1);
  }
} else {
  console.error("❌ Must run inside driver-micro-services");
  process.exit(1);
}

if (!fs.existsSync(path.join(root, "src"))) {
  console.error("❌ Invalid project root");
  process.exit(1);
}

console.log("✅ Driver backend root verified");
