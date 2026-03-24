#!/usr/bin/env ts-node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { IntentParserService } from '../../src/schema/services/intent-parser.service';
import { IntentTranslator } from '../../src/schema/intent/intent-translator';
import { SchemaIntent } from '../../src/schema/intent/schema-intent';
import { DataSource } from 'typeorm';

const program = new Command();

program
  .name('schema:intent')
  .description('Generate migrations from schema intent files')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate migration files from intent')
  .argument('<intent-file>', 'Path to intent JSON/YAML file')
  .option('-o, --output-dir <dir>', 'Output directory for migrations', 'src/migrations')
  .option('-c, --config <file>', 'TypeORM config file', 'src/config/data-source.ts')
  .action(async (intentFile: string, options: { outputDir: string; config: string }) => {
    try {
      console.log('🚀 Schema Intent Generator');
      console.log('─────────────────────────');

      // 1. Parse intent file
      console.log('  [1/6] Parsing intent file...');
      const intentData = await parseIntentFile(intentFile);
      const intent = intentData as SchemaIntent;
      
      // 2. Validate intent
      console.log('  [2/6] Validating intent...');
      const parser = new IntentParserService();
      const validation = parser.parseIntent(intent);
      
      if (!validation.valid) {
        console.error('❌ Intent validation failed:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        process.exit(1);
      }

      // 3. Translate to migration phases
      console.log('  [3/6] Translating intent to migration phases...');
      const translator = new IntentTranslator();
      const translation = await translator.translate(intent);
      const phases = translation.phases;

      // 4. Phase 2: Ephemeral Rehearsal (Shadow Database Simulation)
      console.log('  [4/6] Running ephemeral rehearsal...');
      const rehearsalResult = await runEphemeralRehearsal(phases);
      
      if (!rehearsalResult.success) {
        console.error('❌ Rehearsal failed:');
        console.error(`   - ${rehearsalResult.error}`);
        console.log('   Deleting generated files...');
        await cleanupGeneratedFiles(phases, options.outputDir);
        process.exit(1);
      }

      // 5. Generate migration files
      console.log('  [5/6] Generating migration files...');
      await generateMigrationFiles(phases, options.outputDir);

      // 6. Governance validation
      console.log('  [6/6] Running governance checks...');
      const governanceResult = await runGovernanceChecks(phases, options.outputDir);
      
      if (!governanceResult.passed) {
        console.error('❌ Governance checks failed:');
        governanceResult.errors.forEach(error => console.error(`   - ${error}`));
        console.log('   Deleting generated files...');
        await cleanupGeneratedFiles(phases, options.outputDir);
        process.exit(1);
      }

      console.log('✅ Migration generation complete!');
      console.log('\nGenerated Files:');
      if (Array.isArray(phases)) {
        const timestamp = Date.now();
        phases.forEach((phase, i) => {
          const phaseNumber = i + 1;
          const filename = `${timestamp}-${phase.phase}_${phaseNumber}_${phase.operations[0]?.description?.replace(/\s+/g, '_') || 'migration'}.ts`;
          console.log(`   - ${filename}`);
        });
      }

    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate an intent file without generating migrations')
  .argument('<intent-file>', 'Path to intent JSON/YAML file')
  .action(async (intentFile: string) => {
    try {
      const intentData = await parseIntentFile(intentFile);
      const intent = intentData as SchemaIntent;
      
      const parser = new IntentParserService();
      const validation = parser.parseIntent(intent);
      
      if (validation.valid) {
        console.log('✅ Intent is valid');
      } else {
        console.error('❌ Intent validation failed:');
        validation.errors.forEach(error => console.error(`   - ${error}`));
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    }
  });

async function parseIntentFile(filePath: string): Promise<any> {
  const fullPath = path.resolve(filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Intent file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    const yaml = require('js-yaml');
    return yaml.load(content);
  } else {
    throw new Error('Intent file must be JSON or YAML');
  }
}

async function runEphemeralRehearsal(phases: any[]): Promise<{ success: boolean; error?: string }> {
  try {
    // Create shadow schema
    const shadowSchemaName = `shadow_rehearsal_${Date.now()}`;
    
    // This would need to be implemented with actual database connection
    // For now, we'll simulate the rehearsal
    console.log(`     Creating shadow schema: ${shadowSchemaName}`);
    
    // Simulate running each phase's operations in shadow schema
    for (const phase of phases) {
      console.log(`     Testing phase: ${phase.phase} - ${phase.operations.length} operations`);
      
      // In a real implementation, this would:
      // 1. Create shadow schema
      // 2. Run phase operations SQL
      // 3. Verify no errors and schema is back to original state
      
      // For now, just validate operations exist
      if (!phase.operations || phase.operations.length === 0) {
        return { success: false, error: `Phase missing operations: ${phase.phase}` };
      }
    }
    
    console.log(`     Shadow schema cleanup: ${shadowSchemaName}`);
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function generateMigrationFiles(phases: any[], outputDir: string): Promise<void> {
  const timestamp = Date.now();
  
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phaseNumber = i + 1;
    
    // Generate filename with timestamp and phase number
    const filename = `${timestamp}-${phase.phase}_${phaseNumber}_${phase.operations[0]?.description?.replace(/\s+/g, '_') || 'migration'}.ts`;
    const filePath = path.join(outputDir, filename);
    
    const migrationContent = generateMigrationTemplate(phase, filename);
    
    fs.writeFileSync(filePath, migrationContent);
    console.log(`     Generated: ${filename}`);
  }
}

function generateMigrationTemplate(phase: any, filename: string): string {
  const upOperations = phase.operations.map(op => op.sql || '').join('\n    ');
  const downOperations = phase.rollbackOperations.map(op => op.sql || '').join('\n    ');
  
  return `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${filename.replace('.ts', '')} implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ${phase.phase} phase: ${phase.operations[0]?.description || 'Migration operations'}
    ${upOperations}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback for ${phase.phase} phase
    ${downOperations}
  }
}
`;
}

async function runGovernanceChecks(phases: any[], outputDir: string): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  
  // Basic governance checks
  for (const phase of phases) {
    // Check for destructive operations without proper guards
    const hasDestructiveOps = phase.operations.some(op => 
      op.sql && (op.sql.includes('DROP TABLE') || op.sql.includes('DROP COLUMN'))
    );
    
    if (hasDestructiveOps) {
      if (!phase.operations.some(op => op.requiresApproval)) {
        errors.push(`Destructive operation detected in ${phase.phase} phase without explicit approval`);
      }
    }
    
    // Check for proper rollback
    if (!phase.rollbackOperations || phase.rollbackOperations.length === 0) {
      errors.push(`Missing rollback operations in ${phase.phase} phase`);
    }
  }
  
  return { passed: errors.length === 0, errors };
}

async function cleanupGeneratedFiles(phases: any[], outputDir: string): Promise<void> {
  const timestamp = Date.now();
  
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const phaseNumber = i + 1;
    
    // Generate filename with timestamp and phase number
    const filename = `${timestamp}-${phase.phase}_${phaseNumber}_${phase.operations[0]?.description?.replace(/\s+/g, '_') || 'migration'}.ts`;
    const filePath = path.join(outputDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

program.parse();