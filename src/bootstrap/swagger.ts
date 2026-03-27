import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

const swaggerBuilder = new DocumentBuilder()
  .setTitle("Driver Microservices API")
  .setDescription("Contracts for the Driver PWA and backend services")
  .setVersion("1.0")
  .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
  .setLicense("Buylits", "https://buylits.com");

export function createSwaggerDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, swaggerBuilder.build());
}

export function setupSwagger(app: INestApplication) {
  const document = createSwaggerDocument(app);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: "Driver API Docs",
  });
}
