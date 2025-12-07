# WhatsApp Business API Webhook - Azure Function

Azure Function for handling WhatsApp Business API webhooks for the RestroPulse restaurant SaaS platform.

## Project Structure

```text
whatsappbusinessapi-webhook/          # Root folder
├── host.json                         # Azure Functions global configuration
├── local.settings.json               # Local environment variables
├── package.json                      # Project dependencies
├── .gitignore                        # Git ignore rules
├── README.md                         # This file
└── whatsappWebhook/                  # Function folder
    ├── index.js                      # Main handler
    └── function.json                 # HTTP trigger configuration
```

## Prerequisites

- Node.js (v18 or later)
- Azure Functions Core Tools
- MongoDB (local or Atlas)

## Local Development Setup

**📁 Run all commands from the repository root: `D:\Work\restropulse`**

### 1. Install Dependencies

```powershell
cd whatsappbusinessapi-webhook
npm install
```

### 2. Configure Environment Variables

Update `local.settings.json` with your values:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "MONGODB_URI": "your-mongodb-connection-string",
    "VERIFY_TOKEN": "your-whatsapp-verify-token"
  }
}
```

**Note:** `local.settings.json` is ignored by git to keep credentials secure.

### 3. Start Local Development Server

```powershell
cd whatsappbusinessapi-webhook
func start
```

The webhook will be available at: `http://localhost:7071/api/whatsappWebhook`

## Testing

### Test Webhook Verification (GET)

```powershell
curl "http://localhost:7071/api/whatsappWebhook?hub.mode=subscribe&hub.verify_token=your_verify_token&hub.challenge=test123"
```

Expected response: `test123`

### Test Message Reception (POST)

```powershell
$body = @{
    object = "whatsapp_business_account"
    entry = @(
        @{
            changes = @(
                @{
                    value = @{
                        messages = @(
                            @{
                                from = "1234567890"
                                type = "text"
                                timestamp = "1234567890"
                                text = @{
                                    body = "test message"
                                }
                            }
                        )
                    }
                }
            )
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri "http://localhost:7071/api/whatsappWebhook" -Method POST -Body $body -ContentType "application/json"
```

### Verify MongoDB Storage

Check if messages are being saved:

```powershell
mongosh
use restropulse
db.messagelogs.find().sort({created_at: -1}).limit(1)
```

## Troubleshooting

- **Connection errors**: Verify MongoDB is running and `MONGODB_URI` is correct
- **Verification fails**: Check that `VERIFY_TOKEN` matches in both your request and local.settings.json
- **Module not found**: Run `npm install` to install dependencies

## Deployment

Deploy to Azure:

```powershell
func azure functionapp publish <your-function-app-name>
```

## Functionality

### GET /api/whatsappWebhook

Webhook verification endpoint required by Meta/WhatsApp. Validates the `hub.verify_token` and returns the challenge.

### POST /api/whatsappWebhook

Receives incoming WhatsApp messages and stores them in MongoDB for processing by Python backend.

## Environment Variables

- `MONGODB_URI` - MongoDB connection string (required)
- `VERIFY_TOKEN` - WhatsApp webhook verification token (required)
- `FUNCTIONS_WORKER_RUNTIME` - Set to "node"
- `AzureWebJobsStorage` - Azure Storage connection string (for Azure deployment)

## MongoDB Schemas

All schemas are **auto-generated from Protocol Buffers** (`shared-schemas/restropulse.proto`) and imported from `generated/mongoose-schemas.js`:

- **Restaurant Schema** - Restaurant profile, contact info, and WhatsApp conversation state
- **Content Strategy Schema** - Monthly content planning with approval workflow
- **Post Schema** - Individual social media posts with scheduling and approval tracking
- **Message Log Schema** - WhatsApp message history with media, interactive data, and processing status
- **Support Request Schema** - Customer support tickets
- **WhatsApp Flow Schema** - WhatsApp Flow configurations

**Schema Generation:** Run `.\scripts\compile-proto.ps1` from repository root to regenerate schemas from protobuf definitions.

## Features

- ✅ WhatsApp webhook verification
- ✅ Incoming message handling (text, interactive, flows)
- ✅ Message logging with timestamps
- ✅ MongoDB connection pooling for serverless
- ✅ Support for button replies, list replies, and flow responses
- ✅ Media metadata tracking
