# Migration Guide: Manual Schemas → Auto-Generated Schemas

This guide helps you transition from manually maintained Mongoose/PyMongo schemas to auto-generated schemas from Protocol Buffers.

## Overview

**Before:** Schemas were manually defined in `index.js` and `bot_cron.py`

**After:** Schemas are auto-generated from `shared-schemas/restropulse.proto`

**Benefits:**

- Single source of truth
- Automatic synchronization between JS and Python
- Type safety across languages
- Reduced maintenance burden

## Migration Steps

### Step 1: Verify Generated Schemas

Run the schema generators:

```bash
.\scripts\compile-proto.ps1
```

Check generated files:

- `whatsappbusinessapi-webhook/generated/mongoose-schemas.js`
- `whatsappbusinessapi-bot/generated/pymongo_schemas.py`

### Step 2: Update Webhook (index.js)

#### Before

```javascript
// Manual schema definition
const RestaurantSchema = new Schema({
    whatsapp_id: { type: String, required: true, unique: true },
    business_name: { type: String, required: true },
    // ... more fields
}, { timestamps: true });

const Restaurant = model('Restaurant', RestaurantSchema);
```

#### After

```javascript
// Import generated schemas
import { 
    RestaurantSchema, 
    StrategySchema, 
    PostSchema, 
    MessageLogSchema,
    SupportRequestSchema,
    WhatsAppFlowSchema
} from './generated/mongoose-schemas.js';
import { model } from 'mongoose';

// Create models
const Restaurant = model('Restaurant', RestaurantSchema);
const Strategy = model('Strategy', StrategySchema);
const Post = model('Post', PostSchema);
const MessageLog = model('MessageLog', MessageLogSchema);
const SupportRequest = model('SupportRequest', SupportRequestSchema);
const WhatsAppFlow = model('WhatsAppFlow', WhatsAppFlowSchema);
```

**Key Changes:**

1. Remove manual schema definitions
2. Import schemas from generated file
3. Keep model creation (models are not generated)
4. Keep enum imports from protobuf (unchanged)

### Step 3: Update Bot (bot_cron.py)

#### Before

```python
# Manual validation and queries
restaurants = db['restaurants']
restaurant = restaurants.find_one({'whatsapp_id': whatsapp_id})
```

#### After

```python
from generated.pymongo_schemas import (
    CONVERSATIONSTATE_VALUES,
    MESSAGEDIRECTION_VALUES,
    setup_database
)

# One-time setup: Apply validators and indexes
setup_database(db)

# Use as before
restaurants = db['restaurants']
restaurant = restaurants.find_one({'whatsapp_id': whatsapp_id})
```

**Key Changes:**

1. Import enum value lists from generated schemas
2. Call `setup_database(db)` on initialization
3. Collection operations remain unchanged
4. Optional: Use validators for type checking

### Step 4: Remove Redundant Code

#### In index.js

**Remove:**

```javascript
// ❌ Remove manual schema definitions (lines 86-200+)
const RestaurantSchema = new Schema({ ... });
const StrategySchema = new Schema({ ... });
// ... etc
```

**Keep:**

```javascript
// ✅ Keep protobuf enum imports
import * as pb from './generated/restropulse_pb.js';
const ConversationState = pb.ConversationState;
const MessageDirection = pb.MessageDirection;

// ✅ Keep constants
const WhatsAppObjectType = { ... };
const WebhookMode = { ... };

// ✅ Keep database connection logic
async function connectToDatabase() { ... }

// ✅ Keep Azure Function handler
export default async function (context, req) { ... }
```

#### In bot_cron.py

**Remove:**

```python
# ❌ Remove hardcoded enum classes (if migrating to protobuf enums)
class ConversationState:
    IDLE = 'IDLE'
    ONBOARDING = 'ONBOARDING'
    # ...
```

**Keep:**

```python
# ✅ Keep database operations
db = client[database_name]
restaurants = db['restaurants']

# ✅ Keep business logic
def process_messages():
    # ... unchanged
```

### Step 5: Test the Migration

#### JavaScript Tests

```javascript
// Test model creation
const restaurant = new Restaurant({
    whatsapp_id: '1234567890',
    business_name: 'Test Restaurant'
});

await restaurant.save();
console.log('✓ Restaurant saved successfully');

// Test enum usage
console.log('ConversationState.IDLE:', ConversationState.IDLE);
```

#### Python Tests

```python
# Test validator
from generated.pymongo_schemas import setup_database

setup_database(db)
print('✓ Validators applied')

# Test document creation
restaurant = {
    'whatsapp_id': '1234567890',
    'business_name': 'Test Restaurant',
    'conversation_state': 'IDLE'
}
db.restaurants.insert_one(restaurant)
print('✓ Restaurant inserted')
```

### Step 6: Update Build Process

#### package.json (webhook)

```json
{
  "scripts": {
    "start": "func start",
    "build": "npm run build:proto && npm run generate:schemas",
    "build:proto": "protoc --js_out=import_style=commonjs,binary:./generated --proto_path=../shared-schemas ../shared-schemas/restropulse.proto",
    "generate:schemas": "node ../scripts/generate-mongoose-schemas.js"
  }
}
```

#### Pre-deployment

```bash
# Regenerate schemas before deployment
.\scripts\compile-proto.ps1

# Verify no errors
npm run build
python scripts/generate-pymongo-schemas.py
```

## Comparison: Before vs After

### Schema Definition

| Aspect | Before | After |
|--------|--------|-------|
| Source of truth | Multiple files | `restropulse.proto` |
| Mongoose schemas | Manual in `index.js` | Auto-generated |
| PyMongo validators | Not used | Auto-generated |
| Enums | Duplicated across files | Shared via protobuf |
| Maintenance | Update 3+ files | Update 1 file |
| Sync issues | Common | Eliminated |

### Code Changes

| File | Lines Removed | Lines Added | Net Change |
|------|---------------|-------------|------------|
| index.js | ~150 (schemas) | ~10 (imports) | **-140 lines** |
| bot_cron.py | ~50 (enums) | ~15 (imports) | **-35 lines** |
| Total | ~200 | ~25 | **-175 lines** |

### Workflow Changes

**Before:**

1. Update enum in `index.js`
2. Update enum in `bot_cron.py`
3. Update Mongoose schema in `index.js`
4. Manual testing to ensure sync
5. Deploy

**After:**

1. Update `restropulse.proto`
2. Run `.\scripts\compile-proto.ps1`
3. Automatically generates all schemas
4. Deploy

## Common Issues and Solutions

### Issue: Import Errors

```
Error: Cannot find module './generated/mongoose-schemas.js'
```

**Solution:**

```bash
# Regenerate schemas
.\scripts\compile-proto.ps1
```

### Issue: Type Mismatches

```
ValidationError: conversation_state: `INVALID` is not a valid enum value
```

**Solution:**

- Check enum definition in `restropulse.proto`
- Verify enum value exists
- Regenerate schemas

### Issue: Missing Fields

```
Error: Field 'new_field' not found in schema
```

**Solution:**

1. Add field to protobuf:

   ```protobuf
   message Restaurant {
     // ... existing fields
     string new_field = XX;  // Add with next available number
   }
   ```

2. Regenerate: `.\scripts\compile-proto.ps1`

### Issue: Schema Validation Errors in MongoDB

```
Document failed validation
```

**Solution:**

```python
# Check validation level
db.command({
    "collMod": "restaurants",
    "validationLevel": "moderate"  # Change from "strict" to "moderate"
})
```

## Rollback Plan

If you need to rollback:

1. **Keep backup of manual schemas**

   ```bash
   git stash  # or create a backup branch
   ```

2. **Restore previous version**

   ```bash
   git checkout HEAD~1 -- index.js
   ```

3. **Remove generated imports**
   - Remove `import ... from './generated/mongoose-schemas.js'`
   - Restore manual schema definitions

## Best Practices

### DO

✅ Always regenerate schemas after proto changes
✅ Version control generated files (for review)
✅ Test thoroughly after migration
✅ Document custom business logic separately
✅ Use `setup_database(db)` in Python on startup

### DON'T

❌ Edit generated files manually
❌ Mix manual and generated schemas
❌ Skip schema regeneration before deployment
❌ Commit generated files without review
❌ Ignore validation warnings

## Next Steps

After successful migration:

1. **Add to CI/CD**

   ```yaml
   - name: Generate Schemas
     run: .\scripts\compile-proto.ps1
   
   - name: Verify Changes
     run: git diff --exit-code generated/
   ```

2. **Document schema changes**
   - Add comments to proto file
   - Use proto documentation features

3. **Consider enhancements**
   - Add migration scripts for schema evolution
   - Generate API documentation from schemas
   - Add schema versioning

## Additional Resources

- [Schema Generation README](../scripts/README.md)
- [Protocol Buffers Guide](https://developers.google.com/protocol-buffers)
- [Mongoose Schema Documentation](https://mongoosejs.com/docs/guide.html)
- [MongoDB Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/)

## Support

If you encounter issues during migration:

1. Check generated files for correctness
2. Review error messages carefully
3. Verify protobuf definitions
4. Test with sample data
5. Refer to `scripts/README.md` for troubleshooting

---

**Last Updated:** December 2025
**Migration Status:** ✅ Ready for production use
