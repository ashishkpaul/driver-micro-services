import { NestFactory } from "@nestjs/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { AppModule } from "../src/app.module";
import { createSwaggerDocument } from "../src/bootstrap/swagger";

async function checkDrift() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createSwaggerDocument(app);

  const contractsDir = path.resolve(__dirname, "../contracts");
  const existingPath = path.join(contractsDir, "driver-api.json");

  if (!fs.existsSync(existingPath)) {
    console.error(`Contract file not found at ${existingPath}`);
    console.error("Run npm run openapi:generate to create the baseline");
    process.exit(1);
  }

  const existing = fs.readFileSync(existingPath, "utf-8");
  const expected = JSON.stringify(document, null, 2);

  if (existing.trim() !== expected.trim()) {
    console.error("OpenAPI contract drift detected. Regenerate the spec:");
    console.error("  npm run openapi:generate");
    process.exit(1);
  }

  console.log("OpenAPI contract matches the committed artifact.");
  await app.close();
}

checkDrift().catch((error) => {
  console.error("Failed to check OpenAPI drift", error);
  process.exit(1);
});
