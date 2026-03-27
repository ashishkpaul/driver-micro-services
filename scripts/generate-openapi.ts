import { NestFactory } from "@nestjs/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { AppModule } from "../src/app.module";
import { createSwaggerDocument } from "../src/bootstrap/swagger";

async function generate() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = createSwaggerDocument(app);

  const contractsDir = path.resolve(__dirname, "../contracts");
  fs.mkdirSync(contractsDir, { recursive: true });

  const outputPath = path.join(contractsDir, "driver-api.json");
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI document written to ${outputPath}`);
  await app.close();
}

generate().catch((error) => {
  console.error("Failed to generate OpenAPI spec", error);
  process.exit(1);
});
