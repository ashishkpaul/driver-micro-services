#!/usr/bin/env node

import { Command } from "commander";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { IntentParserService } from "../schema/services/intent-parser.service";
import { IntentTranslatorService } from "../schema/services/intent-translator.service";
import { SchemaIntent } from "../schema/intent/schema-intent";
import * as fs from "fs";
import * as path from "path";

const program = new Command();

program
  .name("driver-intent")
  .description("Schema intent management CLI")
  .version("1.0.0");

program
  .command("create <type>")
  .description("Create a new schema intent template")
  .option("-o, --output <file>", "Output file path")
  .option("-a, --author <author>", "Author name")
  .action(async (type: string, options: { output?: string; author?: string }) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    try {
      const intentParserService = app.get(IntentParserService);
      
      console.log(`Creating intent template for type: ${type}`);

      const template = intentParserService.createTemplate(type);
      
      if (options.author) {
        template.metadata.author = options.author;
      }

      const outputPath = options.output || `intent-${type.toLowerCase()}-${Date.now()}.json`;
      
      await intentParserService.saveIntentToFile(template, outputPath);
      
      console.log(`✅ Intent template created: ${outputPath}`);
      console.log(`📋 Intent type: ${template.type}`);
      console.log(`📝 Description: ${template.metadata.description}`);
      
    } catch (error) {
      console.error(`❌ Failed to create intent template: ${error.message}`);
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command("validate <file>")
  .description("Validate a schema intent file")
  .action(async (file: string) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    try {
      const intentParserService = app.get(IntentParserService);
      
      console.log(`Validating intent file: ${file}`);

      const intent = await intentParserService.loadIntentFromFile(file);
      const validation = intentParserService.parseIntent(intent);

      if (validation.valid) {
        console.log("✅ Intent validation successful");
        
        if (validation.warnings.length > 0) {
          console.log("⚠️  Warnings:");
          validation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
      } else {
        console.log("❌ Intent validation failed");
        console.log("Errors:");
        validation.errors.forEach(error => console.log(`   - ${error}`));
        
        if (validation.warnings.length > 0) {
          console.log("Warnings:");
          validation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        process.exit(1);
      }
      
    } catch (error) {
      console.error(`❌ Failed to validate intent file: ${error.message}`);
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command("translate <file>")
  .description("Translate a schema intent into a migration plan")
  .option("-o, --output <file>", "Output file for translation")
  .option("-f, --format <format>", "Output format (json, yaml, text)", "text")
  .action(async (file: string, options: { output?: string; format?: string }) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    try {
      const intentParserService = app.get(IntentParserService);
      const intentTranslatorService = app.get(IntentTranslatorService);
      
      console.log(`Translating intent file: ${file}`);

      const intent = await intentParserService.loadIntentFromFile(file);
      const validation = intentParserService.parseIntent(intent);

      if (!validation.valid) {
        console.log("❌ Intent validation failed");
        validation.errors.forEach(error => console.log(`   - ${error}`));
        process.exit(1);
      }

      const translation = intentTranslatorService.translateIntent(intent);
      const summary = intentTranslatorService.generateSummary(intent);
      const complexity = intentTranslatorService.calculateComplexity(intent);

      if (options.format === "json") {
        const output = {
          intent,
          translation,
          summary,
          complexity,
        };

        if (options.output) {
          await fs.promises.writeFile(options.output, JSON.stringify(output, null, 2));
          console.log(`✅ Translation saved to: ${options.output}`);
        } else {
          console.log(JSON.stringify(output, null, 2));
        }
      } else if (options.format === "yaml") {
        const yaml = require("js-yaml");
        const output = {
          intent,
          translation,
          summary,
          complexity,
        };

        const yamlOutput = yaml.dump(output);
        
        if (options.output) {
          await fs.promises.writeFile(options.output, yamlOutput);
          console.log(`✅ Translation saved to: ${options.output}`);
        } else {
          console.log(yamlOutput);
        }
      } else {
        // Text format
        console.log("\n📋 INTENT SUMMARY");
        console.log("==================");
        console.log(`Type: ${summary.intentType}`);
        console.log(`Description: ${intent.metadata.description}`);
        console.log(`Author: ${intent.metadata.author}`);
        console.log(`Priority: ${intent.metadata.priority}`);
        console.log(`Estimated Impact: ${intent.metadata.estimatedImpact}`);
        console.log(`Table: ${intent.payload.table}`);
        
        console.log("\n🎯 MIGRATION PLAN");
        console.log("==================");
        console.log(`Estimated Time: ${summary.estimatedTime}`);
        console.log(`Complexity: ${complexity.level} (${complexity.score})`);
        console.log(`Operations: ${summary.operationsCount}`);
        
        if (summary.requiredApprovals.length > 0) {
          console.log(`Required Approvals: ${summary.requiredApprovals.join(", ")}`);
        }

        console.log("\n🔄 PHASES");
        console.log("==========");
        translation.phases.forEach((phase, index) => {
          console.log(`\nPhase ${index + 1}: ${phase.phase}`);
          console.log(`  Duration: ${phase.estimatedDuration}`);
          console.log(`  Dependencies: ${phase.dependencies.join(", ") || "None"}`);
          
          console.log("  Operations:");
          phase.operations.forEach((op, opIndex) => {
            console.log(`    ${opIndex + 1}. ${op.description}`);
            if (op.estimatedTime) {
              console.log(`       Time: ${op.estimatedTime}`);
            }
            if (op.requiresApproval) {
              console.log(`       Requires Approval: Yes`);
            }
          });
        });

        if (summary.rollbackPlan.length > 0) {
          console.log("\n🔙 ROLLBACK PLAN");
          console.log("=================");
          summary.rollbackPlan.forEach((step, index) => {
            console.log(`  ${index + 1}. ${step}`);
          });
        }

        if (complexity.factors.length > 0) {
          console.log("\n📊 COMPLEXITY FACTORS");
          console.log("======================");
          complexity.factors.forEach(factor => {
            console.log(`  - ${factor}`);
          });
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to translate intent: ${error.message}`);
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command("rehearse <file>")
  .description("Rehearse a schema intent (ephemeral validation)")
  .option("-d, --dry-run", "Perform dry run without actual execution", true)
  .action(async (file: string, options: { dryRun?: boolean }) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    try {
      const intentParserService = app.get(IntentParserService);
      const intentTranslatorService = app.get(IntentTranslatorService);
      
      console.log(`Rehearsing intent file: ${file}`);

      const intent = await intentParserService.loadIntentFromFile(file);
      const validation = intentParserService.parseIntent(intent);

      if (!validation.valid) {
        console.log("❌ Intent validation failed");
        validation.errors.forEach(error => console.log(`   - ${error}`));
        process.exit(1);
      }

      const translation = intentTranslatorService.translateIntent(intent);
      const validationResult = intentTranslatorService.validateTranslation(intent);

      console.log("\n🎭 INTENT REHEARSAL");
      console.log("====================");
      console.log(`Intent Type: ${intent.type}`);
      console.log(`Table: ${intent.payload.table}`);
      console.log(`Phases: ${translation.phases.length}`);
      console.log(`Operations: ${translation.phases.reduce((total, phase) => total + phase.operations.length, 0)}`);

      if (validationResult.valid) {
        console.log("✅ Rehearsal validation successful");
      } else {
        console.log("❌ Rehearsal validation failed");
        console.log("Issues:");
        validationResult.issues.forEach(issue => console.log(`   - ${issue}`));
        
        if (validationResult.warnings.length > 0) {
          console.log("Warnings:");
          validationResult.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
        
        process.exit(1);
      }

      console.log("\n📋 REHEARSAL SUMMARY");
      console.log("====================");
      console.log("This intent would execute the following phases:");
      
      translation.phases.forEach((phase, index) => {
        console.log(`\n${index + 1}. ${phase.phase} Phase`);
        console.log(`   Duration: ${phase.estimatedDuration}`);
        console.log(`   Operations: ${phase.operations.length}`);
        
        if (phase.dependencies.length > 0) {
          console.log(`   Dependencies: ${phase.dependencies.join(", ")}`);
        }
        
        phase.operations.forEach((op, opIndex) => {
          console.log(`   ${opIndex + 1}. ${op.description}`);
          if (op.requiresApproval) {
            console.log(`      ⚠️  Requires approval`);
          }
        });
      });

      console.log("\n⚠️  REHEARSAL NOTES");
      console.log("==================");
      console.log("• This is an ephemeral rehearsal - no actual changes were made");
      console.log("• All operations were validated for syntax and dependencies");
      console.log("• Estimated times are based on operation complexity");
      console.log("• Approval requirements are based on operation risk level");
      
      if (options.dryRun) {
        console.log("• Dry run mode: No database operations were executed");
      }
      
    } catch (error) {
      console.error(`❌ Failed to rehearse intent: ${error.message}`);
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program
  .command("rollback <file>")
  .description("Generate rollback plan for a schema intent")
  .option("-o, --output <file>", "Output file for rollback plan")
  .action(async (file: string, options: { output?: string }) => {
    const app = await NestFactory.createApplicationContext(AppModule);
    
    try {
      const intentParserService = app.get(IntentParserService);
      const intentTranslatorService = app.get(IntentTranslatorService);
      
      console.log(`Generating rollback plan for intent: ${file}`);

      const intent = await intentParserService.loadIntentFromFile(file);
      const validation = intentParserService.parseIntent(intent);

      if (!validation.valid) {
        console.log("❌ Intent validation failed");
        validation.errors.forEach(error => console.log(`   - ${error}`));
        process.exit(1);
      }

      const translation = intentTranslatorService.translateIntent(intent);
      const rollbackPlan = translation.rollbackPlan;

      console.log("\n🔙 ROLLBACK PLAN");
      console.log("=================");
      console.log(`Intent Type: ${intent.type}`);
      console.log(`Table: ${intent.payload.table}`);
      console.log(`Rollback Steps: ${rollbackPlan.length}`);

      console.log("\nSteps to rollback:");
      rollbackPlan.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step}`);
      });

      if (options.output) {
        const rollbackData = {
          intent: intent,
          rollbackPlan: rollbackPlan,
          generatedAt: new Date().toISOString(),
        };

        await fs.promises.writeFile(options.output, JSON.stringify(rollbackData, null, 2));
        console.log(`\n✅ Rollback plan saved to: ${options.output}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate rollback plan: ${error.message}`);
      process.exit(1);
    } finally {
      await app.close();
    }
  });

program.parse();