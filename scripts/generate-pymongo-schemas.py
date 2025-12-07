"""
Protobuf to PyMongo Schema Generator

Parses restropulse.proto and generates PyMongo JSON Schema validators
with proper types, enums, and references.
"""

import re
import json
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROTO_PATH = SCRIPT_DIR.parent / 'shared-schemas' / 'restropulse.proto'
OUTPUT_PATH = SCRIPT_DIR.parent / 'whatsappbusinessapi-bot' / 'generated' / 'pymongo_schemas.py'

# Proto to MongoDB BSON type mapping
TYPE_MAP = {
    'string': 'string',
    'int32': 'int',
    'int64': 'date',  # Timestamps stored as datetime in MongoDB
    'double': 'double',
    'bool': 'bool',
}

# Messages that are standalone collections (have 'id' field)
STANDALONE_COLLECTIONS = [
    'AccountManager',
    'SubscriptionPlan',
    'Subscription',
    'Restaurant',
    'ContentStrategy',
    'Post',
    'MessageLog',
    'SupportRequest',
    'WhatsAppFlow'
]

# Fields that should be indexed
INDEXED_FIELDS = {
    'Restaurant': ['whatsapp_id'],
    'ContentStrategy': ['restaurant_id', 'status'],
    'Post': ['restaurant_id', 'strategy_id', 'status'],
    'MessageLog': ['restaurant_whatsapp_id', 'context', 'timestamp'],
    'SupportRequest': ['restaurant_whatsapp_id']
}

# Fields that should be unique
UNIQUE_INDEXES = {
    'Restaurant': ['whatsapp_id'],
    'WhatsAppFlow': ['flow_id']
}

# Fields that are references to other collections (stored as string IDs)
REFERENCE_FIELDS = {
    'account_manager_id': 'AccountManager',
    'subscription_id': 'Subscription',
    'plan_id': 'SubscriptionPlan',
    'restaurant_id': 'Restaurant',
    'strategy_id': 'ContentStrategy'
}

class ProtoParser:
    def __init__(self, proto_content):
        self.content = proto_content
        self.enums = {}
        self.messages = {}
    
    def parse(self):
        self.parse_enums()
        self.parse_messages()
        return {'enums': self.enums, 'messages': self.messages}
    
    def parse_enums(self):
        enum_pattern = r'enum\s+(\w+)\s*\{([^}]+)\}'
        
        for match in re.finditer(enum_pattern, self.content):
            enum_name = match.group(1)
            enum_body = match.group(2)
            
            values = []
            value_pattern = r'(\w+)\s*=\s*\d+'
            
            for value_match in re.finditer(value_pattern, enum_body):
                value_name = value_match.group(1)
                # Skip UNSPECIFIED values
                if 'UNSPECIFIED' not in value_name:
                    values.append(value_name)
            
            self.enums[enum_name] = values
    
    def parse_messages(self):
        message_pattern = r'message\s+(\w+)\s*\{([^}]+)\}'
        
        for match in re.finditer(message_pattern, self.content):
            message_name = match.group(1)
            message_body = match.group(2)
            
            fields = []
            field_pattern = r'(repeated\s+|map<\w+,\s*\w+>)?\s*(\w+)\s+(\w+)\s*=\s*\d+'
            
            for field_match in re.finditer(field_pattern, message_body):
                modifier = field_match.group(1) or ''
                modifier = modifier.strip()
                field_type = field_match.group(2)
                field_name = field_match.group(3)
                
                fields.append({
                    'name': field_name,
                    'type': field_type,
                    'modifier': modifier,
                    'is_repeated': modifier.startswith('repeated'),
                    'is_map': modifier.startswith('map')
                })
            
            self.messages[message_name] = fields


class PyMongoSchemaGenerator:
    def __init__(self, enums, messages):
        self.enums = enums
        self.messages = messages
    
    def generate(self):
        output = '''"""
Auto-generated PyMongo Schema Validators
Generated from: shared-schemas/restropulse.proto
DO NOT EDIT MANUALLY - This file is auto-generated
Run: python scripts/generate-pymongo-schemas.py to regenerate
"""

from typing import Dict, Any, List
from datetime import datetime

# Import protobuf enums for value reference
try:
    from generated import restropulse_pb2 as pb
except ImportError:
    print("Warning: Could not import protobuf definitions. Enum validation may be limited.")
    pb = None

'''

        # Add enum value lists
        output += '# ===== ENUM VALUES =====\n\n'
        for enum_name, values in self.enums.items():
            output += f"{enum_name.upper()}_VALUES = [\n"
            for value in values:
                output += f"    '{value}',\n"
            output += "]\n\n"

        output += '\n# ===== JSON SCHEMA VALIDATORS =====\n\n'

        # Generate validators for standalone collections
        for message_name in STANDALONE_COLLECTIONS:
            if message_name in self.messages:
                output += self.generate_validator(message_name, self.messages[message_name])
                output += '\n\n'

        # Generate indexes dictionary
        output += self.generate_indexes()
        output += '\n\n'

        # Generate helper function to apply validators
        output += self.generate_apply_function()

        return output
    
    def generate_validator(self, message_name, fields):
        validator = f'# {message_name} Validator\n'
        validator += f'{message_name.upper()}_VALIDATOR = {{\n'
        validator += '    "$jsonSchema": {\n'
        validator += '        "bsonType": "object",\n'
        validator += '        "required": [\n'
        
        # Determine required fields
        required_fields = []
        for field in fields:
            if field['name'] in ['whatsapp_id', 'business_name', 'restaurant_whatsapp_id', 'direction']:
                required_fields.append(field['name'])
        
        for req_field in required_fields:
            validator += f'            "{req_field}",\n'
        
        validator += '        ],\n'
        validator += '        "properties": {\n'
        
        # Generate properties
        for field in fields:
            # Skip 'id' field (MongoDB uses _id)
            if field['name'] == 'id':
                continue
            
            validator += self.generate_field(message_name, field)
        
        validator += '        }\n'
        validator += '    }\n'
        validator += '}'
        
        return validator
    
    def generate_field(self, message_name, field):
        field_def = f'            "{field["name"]}": {{\n'
        
        # Check if it's a reference field (stored as string ID)
        if field['name'] in REFERENCE_FIELDS:
            field_def += '                "bsonType": "string",\n'
            field_def += f'                "description": "Reference to {REFERENCE_FIELDS[field["name"]]} collection"\n'
        # Check if it's an enum
        elif field['type'] in self.enums:
            enum_values = self.enums[field['type']]
            field_def += '                "bsonType": "string",\n'
            enum_list = ', '.join([f'"{v}"' for v in enum_values])
            field_def += f'                "enum": [{enum_list}],\n'
            field_def += f'                "description": "{field["type"]} enum value"\n'
        # Check if it's a nested message (embedded document)
        elif field['type'] in self.messages:
            if field['is_repeated']:
                field_def += '                "bsonType": "array",\n'
                field_def += '                "items": ' + self.generate_embedded_schema(field['type']) + '\n'
            else:
                field_def = field_def[:-2] + ' ' + self.generate_embedded_schema(field['type']) + '\n'
        # Primitive types
        else:
            bson_type = self.get_bson_type(field)
            
            if field['is_repeated']:
                field_def += '                "bsonType": "array",\n'
                field_def += f'                "items": {{ "bsonType": "{bson_type}" }}\n'
            elif field['is_map']:
                field_def += '                "bsonType": "object",\n'
                field_def += '                "additionalProperties": { "bsonType": "int" }\n'
            else:
                field_def += f'                "bsonType": "{bson_type}"\n'
        
        field_def += '            },\n'
        return field_def
    
    def generate_embedded_schema(self, message_name):
        fields = self.messages.get(message_name, [])
        if not fields:
            return '{}'
        
        schema = '{\n'
        schema += '                    "bsonType": "object",\n'
        schema += '                    "properties": {\n'
        
        for field in fields:
            if field['name'] == 'id':  # Skip id in embedded docs
                continue
            
            schema += f'                        "{field["name"]}": {{\n'
            
            if field['type'] in self.enums:
                schema += '                            "bsonType": "string"\n'
            elif field['type'] in self.messages:
                # Nested embedded doc (rare but possible)
                schema += '                            "bsonType": "object"\n'
            elif field['is_repeated']:
                bson_type = self.get_bson_type(field)
                schema += '                            "bsonType": "array",\n'
                schema += f'                            "items": {{ "bsonType": "{bson_type}" }}\n'
            elif field['is_map']:
                schema += '                            "bsonType": "object"\n'
            else:
                bson_type = self.get_bson_type(field)
                schema += f'                            "bsonType": "{bson_type}"\n'
            
            schema += '                        },\n'
        
        schema += '                    }\n'
        schema += '                }'
        
        return schema
    
    def get_bson_type(self, field):
        # Special handling for timestamps
        if field['type'] == 'int64' and ('_at' in field['name'] or '_date' in field['name']):
            return 'date'
        
        return TYPE_MAP.get(field['type'], 'string')
    
    def generate_indexes(self):
        output = '# ===== INDEXES =====\n\n'
        output += 'COLLECTION_INDEXES = {\n'
        
        for collection in STANDALONE_COLLECTIONS:
            indexes = INDEXED_FIELDS.get(collection, [])
            unique_indexes = UNIQUE_INDEXES.get(collection, [])
            
            if indexes or unique_indexes:
                output += f'    "{collection.lower()}s": [\n'  # Pluralize collection name
                
                for field in indexes:
                    is_unique = field in unique_indexes
                    output += f'        ("{field}", {{"unique": {str(is_unique).lower()}}}),\n'
                
                output += '    ],\n'
        
        output += '}\n'
        return output
    
    def generate_apply_function(self):
        return '''# ===== HELPER FUNCTIONS =====

def apply_validators(db):
    """
    Apply JSON Schema validators to all collections.
    
    Args:
        db: PyMongo database instance
    """
    validators = {
''' + ''.join([f'        "{name.lower()}s": {name.upper()}_VALIDATOR,\n' 
               for name in STANDALONE_COLLECTIONS]) + '''    }
    
    for collection_name, validator in validators.items():
        try:
            db.command({
                "collMod": collection_name,
                "validator": validator,
                "validationLevel": "moderate",  # moderate = apply to inserts and updates
                "validationAction": "warn"  # warn = log violations but allow writes
            })
            print(f"✓ Applied validator to {collection_name}")
        except Exception as e:
            print(f"✗ Error applying validator to {collection_name}: {e}")


def create_indexes(db):
    """
    Create indexes for all collections.
    
    Args:
        db: PyMongo database instance
    """
    for collection_name, indexes in COLLECTION_INDEXES.items():
        collection = db[collection_name]
        
        for field, options in indexes:
            try:
                collection.create_index([(field, 1)], **options)
                print(f"✓ Created index on {collection_name}.{field}")
            except Exception as e:
                print(f"✗ Error creating index on {collection_name}.{field}: {e}")


def setup_database(db):
    """
    Complete database setup: apply validators and create indexes.
    
    Args:
        db: PyMongo database instance
    """
    print("Setting up database schema...")
    apply_validators(db)
    create_indexes(db)
    print("Database setup complete!")


# Example usage:
if __name__ == "__main__":
    from pymongo import MongoClient
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DATABASE", "restropulse")]
    
    setup_database(db)
'''


# Main execution
def main():
    try:
        print('Reading protobuf file...')
        proto_content = PROTO_PATH.read_text(encoding='utf-8')
        
        print('Parsing protobuf definitions...')
        parser = ProtoParser(proto_content)
        result = parser.parse()
        enums = result['enums']
        messages = result['messages']
        
        print(f'Found {len(enums)} enums and {len(messages)} messages')
        
        print('Generating PyMongo validators...')
        generator = PyMongoSchemaGenerator(enums, messages)
        output = generator.generate()
        
        print('Writing output file...')
        OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_PATH.write_text(output, encoding='utf-8')
        
        print(f'✓ PyMongo schemas generated successfully at {OUTPUT_PATH}')
    except Exception as e:
        print(f'Error generating PyMongo schemas: {e}')
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == '__main__':
    main()
