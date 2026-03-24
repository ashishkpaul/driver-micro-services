import { Injectable, Logger } from "@nestjs/common";
import { SchemaIntent, SchemaIntentParser, IntentValidation } from "../intent/schema-intent";

@Injectable()
export class IntentParserService {
  private readonly logger = new Logger(IntentParserService.name);

  /**
   * Parse and validate a schema intent file
   */
  parseIntent(intentData: any): IntentValidation {
    this.logger.log(`Parsing schema intent: ${intentData.type}`);
    
    const validation = SchemaIntentParser.parse(intentData);
    
    if (validation.valid) {
      this.logger.log(`✅ Intent validation successful for ${intentData.type}`);
    } else {
      this.logger.error(`❌ Intent validation failed for ${intentData.type}`, validation.errors);
    }

    return validation;
  }

  /**
   * Create a template for a specific intent type
   */
  createTemplate(type: string): SchemaIntent {
    this.logger.log(`Creating template for intent type: ${type}`);
    return SchemaIntentParser.createTemplate(type as any);
  }

  /**
   * Validate intent file structure and content
   */
  validateIntentFile(intentData: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check basic structure
    if (!intentData.version) {
      errors.push("Missing version field");
    }

    if (!intentData.type) {
      errors.push("Missing type field");
    }

    if (!intentData.metadata) {
      errors.push("Missing metadata section");
    } else {
      if (!intentData.metadata.author) {
        errors.push("Missing author in metadata");
      }
      if (!intentData.metadata.description) {
        errors.push("Missing description in metadata");
      }
    }

    if (!intentData.payload) {
      errors.push("Missing payload section");
    } else {
      if (!intentData.payload.table) {
        errors.push("Missing table name in payload");
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Load intent from file path
   */
  async loadIntentFromFile(filePath: string): Promise<SchemaIntent> {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(filePath, 'utf8');
      const intentData = JSON.parse(content);
      
      this.logger.log(`Loaded intent from file: ${filePath}`);
      return intentData;
    } catch (error) {
      this.logger.error(`Failed to load intent from file: ${filePath}`, error);
      throw new Error(`Failed to load intent file: ${error.message}`);
    }
  }

  /**
   * Save intent to file
   */
  async saveIntentToFile(intent: SchemaIntent, filePath: string): Promise<void> {
    try {
      const fs = require('fs').promises;
      const content = JSON.stringify(intent, null, 2);
      await fs.writeFile(filePath, content, 'utf8');
      
      this.logger.log(`Saved intent to file: ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to save intent to file: ${filePath}`, error);
      throw new Error(`Failed to save intent file: ${error.message}`);
    }
  }
}