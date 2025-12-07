# Schema Generation System

This folder contains automated schema generators that maintain a **single source of truth** in Protocol Buffers and generate database-specific schemas for both JavaScript (Mongoose) and Python (PyMongo).

## Architecture

```
shared-schemas/restropulse.proto (Single Source of Truth)
           |
           ├─→ Protobuf Compilation
           |   ├─→ restropulse_pb.js (JavaScript)
           |   └─→ restropulse_pb2.py (Python)
           |
           └─→ Schema Generation
               ├─→ mongoose-schemas.js (Mongoose/MongoDB for Node.js)
               └─→ pymongo_schemas.py (PyMongo/MongoDB for Python)
```

## Why This Approach?

### Single Source of Truth

- **One schema definition** in `restropulse.proto` drives everything
- Changes to data structures are made in one place
- Reduces inconsistencies between JavaScript and Python codebases

### Type Safety

- Protocol Buffers provide **compile-time type checking**
- Enums are shared across both languages
- Prevents runtime errors from type mismatches

### Automatic Generation

- Database schemas are **auto-generated** from protobuf definitions
- No manual synchronization needed
- Mongoose and PyMongo schemas stay in sync automatically

### Best of Both Worlds

- **Protobuf**: Handles data structure definitions and cross-language validation
- **Mongoose/PyMongo**: Handles database-specific features (indexes, defaults, validation rules)

## Files

### Generator Scripts

- **`generate-mongoose-schemas.js`**: Generates Mongoose schemas from protobuf
  - Parses `restropulse.proto`
  - Creates Mongoose Schema definitions
  - Adds indexes, references, and defaults
  - Output: `whatsappbusinessapi-webhook/generated/mongoose-schemas.js`

- **`generate-pymongo-schemas.py`**: Generates PyMongo validators from protobuf
  - Parses `restropulse.proto`
  - Creates JSON Schema validators
  - Adds index definitions
  - Output: `whatsappbusinessapi-bot/generated/pymongo_schemas.py`

### Compilation Scripts

- **`compile-proto.ps1`**: PowerShell script for Windows
  - Compiles protobuf for JS and Python
  - Runs both schema generators
  - Validates all outputs

- **`compile-proto.sh`**: Bash script for macOS/Linux
  - Same functionality as PowerShell version
  - Cross-platform compatibility

## Usage

### Automatic Generation (Recommended)

Run the compilation script to regenerate everything:

**Windows (PowerShell):**

```powershell
.\scripts\compile-proto.ps1
```

**macOS/Linux:**

```bash
bash scripts/compile-proto.sh
```

This will:

1. Compile protobuf to JavaScript and Python
2. Generate Mongoose schemas
3. Generate PyMongo validators
4. Validate all outputs

### Manual Generation

**Mongoose schemas only:**

```bash
node scripts/generate-mongoose-schemas.js
# or
npm run generate:schemas
```

**PyMongo schemas only:**

```bash
python scripts/generate-pymongo-schemas.py
```

## Generated Files

### JavaScript (Mongoose)

**Location:** `whatsappbusinessapi-webhook/generated/mongoose-schemas.js`

**Contains:**

- Mongoose Schema definitions for all collections
- Enum references from protobuf
- Field types, defaults, and validation
- Index definitions
- Reference fields (ObjectId refs)

**Usage:**

```javascript
import { RestaurantSchema, StrategySchema, PostSchema } from './generated/mongoose-schemas.js';
import { model } from 'mongoose';

const Restaurant = model('Restaurant', RestaurantSchema);
const Strategy = model('Strategy', StrategySchema);
```

### Python (PyMongo)

**Location:** `whatsappbusinessapi-bot/generated/pymongo_schemas.py`

**Contains:**

- JSON Schema validators for all collections
- Enum value lists
- BSON type definitions
- Index definitions
- Helper functions (`apply_validators`, `create_indexes`, `setup_database`)

**Usage:**

```python
from generated.pymongo_schemas import setup_database
from pymongo import MongoClient

client = MongoClient(MONGODB_URI)
db = client[DATABASE_NAME]

# Apply validators and create indexes
setup_database(db)
```

## How It Works

### 1. Protobuf Parsing

Both generators parse the `.proto` file to extract:

- **Enums**: Used for field validation (e.g., `SubscriptionStatus`)
- **Messages**: Converted to schemas/validators
- **Field types**: Mapped to database types
- **Relationships**: Detected from field names (e.g., `restaurant_id` → reference to Restaurant)

### 2. Type Mapping

**Mongoose (JavaScript):**

```
string  → String
int32   → Number
int64   → Date (for timestamps)
double  → Number
bool    → Boolean
repeated → Array
```

**PyMongo (Python):**

```
string  → "string"
int32   → "int"
int64   → "date" (for timestamps)
double  → "double"
bool    → "bool"
repeated → "array"
```

### 3. Special Handling

#### Reference Fields

Fields ending in `_id` are automatically converted to references:

```javascript
// Mongoose
restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' }

// PyMongo (stored as string)
"restaurant_id": { "bsonType": "string", "description": "Reference to Restaurant collection" }
```

#### Embedded Documents

Messages without `id` fields are treated as embedded:

```javascript
// Mongoose
post_breakdown: {
  menu_highlights: { type: Number, default: 0 },
  customer_reviews: { type: Number, default: 0 }
}

// PyMongo
"post_breakdown": {
  "bsonType": "object",
  "properties": { ... }
}
```

#### Timestamps

Fields with `int64` type and `_at` or `_date` suffix are treated as timestamps:

```javascript
// Automatically converted to Date type
last_interaction_at: { type: Date, default: Date.now }
```

#### Indexes

Defined in generator configuration based on query patterns:

```javascript
// Mongoose
RestaurantSchema.index({ whatsapp_id: 1 });

// PyMongo
"restaurants": [
    ("whatsapp_id", {"unique": True}),
]
```

## Workflow

### Making Schema Changes

1. **Edit `shared-schemas/restropulse.proto`**

   ```protobuf
   message Restaurant {
     string id = 1;
     string whatsapp_id = 2;
     string business_name = 3;
     // Add new field
     string timezone = 4;
   }
   ```

2. **Run compilation script**

   ```bash
   .\scripts\compile-proto.ps1
   ```

3. **Verify generated files**
   - Check `whatsappbusinessapi-webhook/generated/mongoose-schemas.js`
   - Check `whatsappbusinessapi-bot/generated/pymongo_schemas.py`

4. **Use in your code**
   - JavaScript: Import and use the updated schemas
   - Python: Run `setup_database(db)` to apply validators

### CI/CD Integration

Add to your CI/CD pipeline:

```yaml
# Example: GitHub Actions
- name: Generate Schemas
  run: |
    npm install
    pip install -r requirements.txt
    ./scripts/compile-proto.ps1  # or compile-proto.sh
    
- name: Verify Generated Files
  run: |
    git diff --exit-code generated/
```

## Configuration

### Adding New Collections

1. Add message in `restropulse.proto` with `id` field
2. Add to `STANDALONE_COLLECTIONS` in both generators:

   ```javascript
   // generate-mongoose-schemas.js
   const STANDALONE_COLLECTIONS = [
     'Restaurant',
     'NewCollection'  // Add here
   ];
   ```

   ```python
   # generate-pymongo-schemas.py
   STANDALONE_COLLECTIONS = [
       'Restaurant',
       'NewCollection'  # Add here
   ]
   ```

3. Regenerate schemas

### Adding Indexes

Update `INDEXED_FIELDS` in both generators:

```javascript
// generate-mongoose-schemas.js
const INDEXED_FIELDS = {
  'Restaurant': ['whatsapp_id', 'new_field'],
};
```

```python
# generate-pymongo-schemas.py
INDEXED_FIELDS = {
    'Restaurant': ['whatsapp_id', 'new_field'],
}
```

### Adding Unique Constraints

Update `UNIQUE_FIELDS` (Mongoose) / `UNIQUE_INDEXES` (PyMongo):

```javascript
const UNIQUE_FIELDS = {
  'Restaurant': ['whatsapp_id', 'email'],
};
```

## Troubleshooting

### Protoc Not Found

```
Error: protoc compiler not found!
```

**Solution:** Install Protocol Buffers compiler

- Windows: `choco install protoc`
- macOS: `brew install protobuf`
- Linux: `apt-get install protobuf-compiler`

### Import Errors in Generated Files

```
Cannot find module './restropulse_pb.js'
```

**Solution:** Run full compilation script, not just schema generators

### Schema Validation Errors in MongoDB

```
Document failed validation
```

**Solution:**

1. Check if enum values match protobuf definitions
2. Verify required fields are present
3. Review validation level in PyMongo (`moderate` vs `strict`)

## Best Practices

1. **Never edit generated files manually** - They will be overwritten
2. **Always regenerate after protobuf changes** - Keep schemas in sync
3. **Version control generated files** - Makes reviews easier (optional)
4. **Test after regeneration** - Verify applications still work
5. **Document custom validation** - Add comments in proto file

## Future Enhancements

- [ ] Add migration script generator for schema changes
- [ ] Generate GraphQL schema from protobuf
- [ ] Add validation for breaking changes
- [ ] Generate API documentation from schemas
- [ ] Add schema versioning support

## References

- [Protocol Buffers Documentation](https://developers.google.com/protocol-buffers)
- [Mongoose Schema Documentation](https://mongoosejs.com/docs/guide.html)
- [MongoDB Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/)
