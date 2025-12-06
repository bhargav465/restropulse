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

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure `local.settings.json` with your credentials:

   ```json
   {
     "Values": {
       "MONGODB_URI": "your-mongodb-connection-string",
       "VERIFY_TOKEN": "your-whatsapp-verify-token"
     }
   }
   ```

3. Run locally:

   ```bash
   func start
   ```

   The function will be available at: `http://localhost:7071/api/whatsappWebhook`

4. Deploy to Azure:

   ```bash
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

All schemas are embedded in `index.js`:

- **Restaurant/User Schema** - Restaurant profile and subscription info
- **Content Strategy Schema** - Content planning and approval workflow
- **Post Schema** - Social media posts with status tracking
- **Message Log Schema** - WhatsApp message history with media support

## Features

- ✅ WhatsApp webhook verification
- ✅ Incoming message handling (text, interactive, flows)
- ✅ Message logging with timestamps
- ✅ MongoDB connection pooling for serverless
- ✅ Support for button replies, list replies, and flow responses
- ✅ Media metadata tracking
