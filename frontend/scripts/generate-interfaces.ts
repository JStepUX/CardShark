const fs = require('fs');
const path = require('path');
const { compile } = require('json-schema-to-typescript');

async function generateInterfaces() {
  try {
    // Path to schema file (relative to project root)
    const schemaPath = path.join(__dirname, '../../schema/character_schema.json');
    const outputPath = path.join(__dirname, '../src/types/generated-schema.ts');
    
    console.log(`Reading schema from ${schemaPath}`);
    
    // Check if schema exists
    if (!fs.existsSync(schemaPath)) {
      console.error(`Schema file not found at: ${schemaPath}`);
      console.error('Make sure you have created the schema file first.');
      process.exit(1);
    }
    
    // Read schema file
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    
    // Convert schema to TypeScript interfaces
    const ts = await compile(schema, 'CharacterCard', {
      bannerComment: '/* This file is auto-generated from JSON schema. Do not edit manually. */',
      style: {
        singleQuote: true,
        semi: true,
        tabWidth: 2
      }
    });
    
    // Write to file
    fs.writeFileSync(outputPath, ts);
    
    console.log(`✅ TypeScript interfaces generated successfully at ${outputPath}`);
  } catch (error) {
    console.error('Error generating TypeScript interfaces:', error);
    process.exit(1);
  }
}

generateInterfaces();