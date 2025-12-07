# Protocol Buffers - Shared Schemas

This directory contains Protocol Buffer (protobuf) schema definitions shared between:

- **whatsappbusinessapi-webhook** (JavaScript/Node.js)
- **whatsappbusinessapi-bot** (Python)

## Why Protobuf?

Protobuf provides:

- **Type Safety**: Compile-time validation ensures both services use the same data structures
- **Schema Evolution**: Safely add/remove fields without breaking existing code
- **Cross-Language**: Single source of truth for enums, constants, and message types
- **Validation**: Catches type mismatches before deployment

## Files

- `restropulse.proto` - Main schema definition with all enums and message types

## Compilation

### Prerequisites

Install Protocol Buffers compiler:

**Windows:**

```powershell
choco install protoc
```

**macOS:**

```bash
brew install protobuf
```

**Linux:**

```bash
apt-get install protobuf-compiler
```

Verify installation:

```bash
protoc --version
```

### Compile Schemas

From the workspace root, run:

**Windows:**

```powershell
.\compile-proto.ps1
```

**macOS/Linux:**

```bash
chmod +x compile-proto.sh
./compile-proto.sh
```

This generates:

- `whatsappbusinessapi-webhook/generated/restropulse_pb.js` (JavaScript)
- `whatsappbusinessapi-bot/generated/restropulse_pb2.py` (Python)

## Usage

### JavaScript (Webhook)

```javascript
const { ConversationState, MessageLog } = require('./generated/restropulse_pb');

// Use enum
const state = ConversationState.IDLE;

// Create message
const log = new MessageLog();
log.setRestaurantWhatsappId('1234567890');
log.setProcessed(false);
```

### Python (Bot)

```python
from generated import restropulse_pb2

# Use enum
state = restropulse_pb2.ConversationState.IDLE

# Create message
log = restropulse_pb2.MessageLog()
log.restaurant_whatsapp_id = '1234567890'
log.processed = False
```

## Schema Evolution

When modifying schemas:

1. **Never change field numbers** - they're the wire format identifiers
2. **Add new fields** - use new field numbers (safe)
3. **Mark removed fields as reserved** - prevents reuse
4. **Use optional** for fields that might not exist

Example:

```protobuf
message Restaurant {
  string id = 1;
  string whatsapp_id = 2;
  reserved 3;  // Old field removed
  string new_field = 4;  // Safe to add
}
```

## Development Workflow

1. Modify `restropulse.proto`
2. Run `./compile-proto.ps1` or `./compile-proto.sh`
3. Commit both `.proto` and generated files
4. Both webhook and bot automatically use updated schemas

## CI/CD Integration

Add to your build pipeline:

```yaml
- name: Compile Protobuf
  run: ./compile-proto.sh
```

This ensures schemas are always in sync before deployment.
