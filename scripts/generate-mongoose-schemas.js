/**
 * Protobuf to Mongoose Schema Generator
 * 
 * Parses restropulse.proto and generates Mongoose schemas
 * with proper types, enums, references, and indexes.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PROTO_PATH = join(__dirname, '../shared-schemas/restropulse.proto');
const OUTPUT_PATH = join(__dirname, '../whatsappbusinessapi-webhook/generated/mongoose-schemas.js');

// Proto to Mongoose type mapping
const TYPE_MAP = {
    'string': 'String',
    'int32': 'Number',
    'int64': 'Date', // Timestamps are stored as Date in MongoDB
    'double': 'Number',
    'bool': 'Boolean',
    'repeated': 'Array',
    'map': 'Map'
};

// Messages that are standalone collections (have 'id' field)
const STANDALONE_COLLECTIONS = [
    'AccountManager',
    'SubscriptionPlan',
    'Subscription',
    'Restaurant',
    'ContentStrategy',
    'Post',
    'MessageLog',
    'SupportRequest',
    'WhatsAppFlow'
];

// Fields that should be indexed
const INDEXED_FIELDS = {
    'Restaurant': ['whatsapp_id'],
    'ContentStrategy': ['restaurant_id', 'status'],
    'Post': ['restaurant_id', 'strategy_id', 'status'],
    'MessageLog': ['restaurant_whatsapp_id', 'context', 'timestamp'],
    'SupportRequest': ['restaurant_whatsapp_id']
};

// Fields that should be unique
const UNIQUE_FIELDS = {
    'Restaurant': ['whatsapp_id'],
    'WhatsAppFlow': ['flow_id']
};

// Fields that are references to other collections
const REFERENCE_FIELDS = {
    'account_manager_id': 'AccountManager',
    'subscription_id': 'Subscription',
    'plan_id': 'SubscriptionPlan',
    'restaurant_id': 'Restaurant',
    'strategy_id': 'ContentStrategy'
};

class ProtoParser {
    constructor(protoContent) {
        this.content = protoContent;
        this.enums = {};
        this.messages = {};
    }

    parse() {
        this.parseEnums();
        this.parseMessages();
        return { enums: this.enums, messages: this.messages };
    }

    parseEnums() {
        const enumPattern = /enum\s+(\w+)\s*\{([^}]+)\}/g;
        let match;

        while ((match = enumPattern.exec(this.content)) !== null) {
            const enumName = match[1];
            const enumBody = match[2];

            const values = [];
            const valuePattern = /(\w+)\s*=\s*\d+/g;
            let valueMatch;

            while ((valueMatch = valuePattern.exec(enumBody)) !== null) {
                const valueName = valueMatch[1];
                // Skip UNSPECIFIED values
                if (!valueName.includes('UNSPECIFIED')) {
                    values.push(valueName);
                }
            }

            this.enums[enumName] = values;
        }
    }

    parseMessages() {
        const messagePattern = /message\s+(\w+)\s*\{([^}]+)\}/g;
        let match;

        while ((match = messagePattern.exec(this.content)) !== null) {
            const messageName = match[1];
            const messageBody = match[2];

            const fields = [];
            const fieldPattern = /(repeated\s+|map<\w+,\s*\w+>)?\s*(\w+)\s+(\w+)\s*=\s*\d+/g;
            let fieldMatch;

            while ((fieldMatch = fieldPattern.exec(messageBody)) !== null) {
                const modifier = fieldMatch[1]?.trim() || '';
                const type = fieldMatch[2];
                const name = fieldMatch[3];

                fields.push({
                    name,
                    type,
                    modifier,
                    isRepeated: modifier.startsWith('repeated'),
                    isMap: modifier.startsWith('map')
                });
            }

            this.messages[messageName] = fields;
        }
    }
}

class MongooseSchemaGenerator {
    constructor(enums, messages) {
        this.enums = enums;
        this.messages = messages;
    }

    generate() {
        let output = `/**
 * Auto-generated Mongoose Schemas
 * Generated from: shared-schemas/restropulse.proto
 * DO NOT EDIT MANUALLY - This file is auto-generated
 * Run: npm run generate:schemas to regenerate
 */

import { Schema } from 'mongoose';
import * as pb from './restropulse_pb.cjs';

// ===== PROTOBUF ENUM REFERENCES =====
`;

        // Add enum references
        for (const enumName of Object.keys(this.enums)) {
            output += `const ${enumName} = pb.${enumName};\n`;
        }

        output += `\n// ===== MONGOOSE SCHEMAS =====\n\n`;

        // Generate schemas for standalone collections
        for (const messageName of STANDALONE_COLLECTIONS) {
            if (this.messages[messageName]) {
                output += this.generateSchema(messageName, this.messages[messageName]);
                output += '\n\n';
            }
        }

        // Export schemas
        output += '// ===== EXPORTS =====\n';
        output += 'export {\n';
        for (const messageName of STANDALONE_COLLECTIONS) {
            output += `  ${messageName}Schema,\n`;
        }
        output += '};\n';

        return output;
    }

    generateSchema(messageName, fields) {
        let schema = `// ${messageName} Schema\n`;
        schema += `const ${messageName}Schema = new Schema({\n`;

        for (const field of fields) {
            // Skip 'id' field (MongoDB provides _id)
            if (field.name === 'id') continue;

            // Skip created_at and updated_at (handled by timestamps)
            if (field.name === 'created_at' || field.name === 'updated_at') continue;

            schema += this.generateField(messageName, field);
        }

        schema += '}';

        // Add timestamps option
        schema += ', { timestamps: true }';

        schema += ');';

        // Add indexes
        const indexes = INDEXED_FIELDS[messageName] || [];
        if (indexes.length > 0) {
            schema += '\n\n';
            for (const indexField of indexes) {
                schema += `${messageName}Schema.index({ ${indexField}: 1 });\n`;
            }
        }

        return schema;
    }

    generateField(messageName, field) {
        let fieldDef = `  ${field.name}: `;

        // Check if it's a reference field
        if (REFERENCE_FIELDS[field.name]) {
            const refCollection = REFERENCE_FIELDS[field.name];
            fieldDef += `{ type: Schema.Types.ObjectId, ref: '${refCollection}' }`;
        }
        // Check if it's an enum
        else if (this.enums[field.type]) {
            const enumValues = this.enums[field.type];
            const isUnique = (UNIQUE_FIELDS[messageName] || []).includes(field.name);
            const isIndexed = (INDEXED_FIELDS[messageName] || []).includes(field.name);

            fieldDef += '{ ';
            fieldDef += 'type: String, ';
            fieldDef += `enum: [${enumValues.map(v => `'${v}'`).join(', ')}]`;

            // Add default value for specific enums
            if (field.type === 'ConversationState') {
                fieldDef += `, default: '${enumValues[0]}'`;
            } else if (field.type === 'StrategyStatus') {
                fieldDef += `, default: '${enumValues[0]}'`;
            } else if (field.type === 'PostStatus') {
                fieldDef += `, default: '${enumValues[0]}'`;
            }

            if (isUnique) fieldDef += ', unique: true';
            if (isIndexed) fieldDef += ', index: true';

            fieldDef += ' }';
        }
        // Check if it's a nested message (embedded document)
        else if (this.messages[field.type]) {
            if (field.isRepeated) {
                fieldDef += `[${this.generateEmbeddedSchema(field.type)}]`;
            } else {
                fieldDef += this.generateEmbeddedSchema(field.type);
            }
        }
        // Primitive types
        else {
            const mongooseType = this.getMongooseType(field);
            const isRequired = ['whatsapp_id', 'business_name', 'restaurant_whatsapp_id', 'direction'].includes(field.name);
            const isUnique = (UNIQUE_FIELDS[messageName] || []).includes(field.name);
            const isIndexed = (INDEXED_FIELDS[messageName] || []).includes(field.name);

            if (field.isRepeated) {
                fieldDef += `[{ type: ${mongooseType} }]`;
            } else if (field.isMap) {
                fieldDef += '{ type: Map, of: Number }'; // Assuming maps are string->number
            } else {
                fieldDef += '{ ';
                fieldDef += `type: ${mongooseType}`;

                if (isRequired) fieldDef += ', required: true';
                if (isUnique) fieldDef += ', unique: true';
                if (isIndexed) fieldDef += ', index: true';

                // Add defaults for specific fields
                if (field.name === 'bot_response_sent' || field.name === 'requires_human_attention') {
                    fieldDef += ', default: false';
                } else if (field.type === 'int64' && (field.name.includes('_at') || field.name.includes('date'))) {
                    fieldDef += ', default: Date.now';
                }

                fieldDef += ' }';
            }
        }

        fieldDef += ',\n';
        return fieldDef;
    }

    generateEmbeddedSchema(messageName) {
        const fields = this.messages[messageName];
        if (!fields) return '{}';

        let schema = '{\n';

        for (const field of fields) {
            if (field.name === 'id') continue; // Embedded docs don't have IDs

            const indent = '    ';
            schema += indent + field.name + ': ';

            if (this.enums[field.type]) {
                schema += `{ type: String }`;
            } else if (this.messages[field.type]) {
                // Check if it's repeated (array of embedded docs)
                if (field.isRepeated) {
                    schema += '[' + this.generateEmbeddedSchema(field.type) + ']';
                } else {
                    schema += this.generateEmbeddedSchema(field.type);
                }
            } else if (field.isRepeated) {
                const mongooseType = this.getMongooseType(field);
                schema += `[{ type: ${mongooseType} }]`;
            } else if (field.isMap) {
                schema += '{ type: Map, of: Number }';
            } else {
                const mongooseType = this.getMongooseType(field);
                schema += `{ type: ${mongooseType}`;

                if (field.type === 'int32' && field.name !== 'day_of_month') {
                    schema += ', default: 0';
                }

                schema += ' }';
            }

            schema += ',\n';
        }

        schema += '  }';
        return schema;
    }

    getMongooseType(field) {
        if (field.type.startsWith('map')) {
            return 'Map';
        }

        // Special handling for timestamps
        if (field.type === 'int64' && (field.name.includes('_at') || field.name.includes('_date'))) {
            return 'Date';
        }

        return TYPE_MAP[field.type] || 'String';
    }
}

// Main execution
try {
    console.log('Reading protobuf file...');
    const protoContent = readFileSync(PROTO_PATH, 'utf-8');

    console.log('Parsing protobuf definitions...');
    const parser = new ProtoParser(protoContent);
    const { enums, messages } = parser.parse();

    console.log(`Found ${Object.keys(enums).length} enums and ${Object.keys(messages).length} messages`);

    console.log('Generating Mongoose schemas...');
    const generator = new MongooseSchemaGenerator(enums, messages);
    const output = generator.generate();

    console.log('Writing output file...');
    writeFileSync(OUTPUT_PATH, output, 'utf-8');

    console.log(`[SUCCESS] Mongoose schemas generated successfully at ${OUTPUT_PATH}`);
} catch (error) {
    console.error('Error generating Mongoose schemas:', error.message);
    process.exit(1);
}
