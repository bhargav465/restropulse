# WhatsApp Business API Bot - Python Cron Job

Python-based cron job for processing WhatsApp Business API bot interactions for the RestroPulse restaurant SaaS platform.

## Overview

This cron job continuously polls MongoDB for unprocessed messages and handles:
- Restaurant conversation state management
- Main menu navigation
- Strategy review and approval workflow
- Post review and approval workflow
- Support request handling
- WhatsApp message sending (text, interactive buttons, lists, media)

## Architecture

```
┌─────────────────────┐
│  Restaurant Owner   │
│   (WhatsApp User)   │
└──────────┬──────────┘
           │
           │ Messages
           ▼
┌─────────────────────┐
│ WhatsApp Business   │
│       API           │
└──────────┬──────────┘
           │
           │ Webhook Events
           ▼
┌─────────────────────┐
│  Azure Functions    │
│   (Webhook Handler) │
│   - Verify Webhook  │
│   - Store Messages  │
└──────────┬──────────┘
           │
           │ Store/Read
           ▼
┌─────────────────────┐
│     MongoDB         │
│  - Restaurants      │
│  - Strategies       │
│  - Posts            │
│  - MessageLogs      │
└──────────┬──────────┘
           │
           │ Poll/Process (Every 5s)
           ▼
┌─────────────────────┐
│  Python Cron Job    │
│  (This Service)     │
│   - Process Msgs    │
│   - Send Responses  │
│   - Update States   │
└─────────────────────┘
```

## Installation

1. Create a virtual environment:

   ```bash
   python -m venv venv
   ```

2. Activate the virtual environment:

   **Windows:**
   ```bash
   .\venv\Scripts\Activate.ps1
   ```

   **macOS/Linux:**
   ```bash
   source venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:

   ```bash
   cp .env.test .env
   ```

   Edit `.env` with your actual credentials.

## Required Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `WHATSAPP_API_URL` - WhatsApp Business API URL (default: https://graph.facebook.com/v18.0)
- `WHATSAPP_PHONE_NUMBER_ID` - Your WhatsApp phone number ID
- `WHATSAPP_ACCESS_TOKEN` - WhatsApp API access token
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Storage connection string (for media uploads)
- `AZURE_STORAGE_CONTAINER_NAME` - Azure Storage container name
- `CRON_INTERVAL_SECONDS` - Polling interval in seconds (default: 5)
- `LOG_LEVEL` - Logging level (default: INFO)

## Usage

### Running in Jupyter Notebook

1. Start Jupyter:

   ```bash
   jupyter notebook
   ```

2. Open `message_processor.ipynb` and run the cells to start processing messages

### Running as a Standalone Script

**Note:** `bot_cron.py` is auto-generated from `message_processor.ipynb`. To regenerate:

```bash
jupyter nbconvert --to script message_processor.ipynb --output bot_cron
```

Then run:

```bash
python bot_cron.py
```

The cron job will continuously poll for unprocessed messages every 5 seconds (configurable).

### Development Mode

For development and testing, use the Jupyter notebook `message_processor.ipynb` which provides:
- Interactive development and debugging
- Step-by-step message processing
- Testing individual functions
- Visualizing conversation flows

**Important:** The notebook is the source of truth. After making changes, regenerate `bot_cron.py`:
```bash
jupyter nbconvert --to script message_processor.ipynb --output bot_cron
```

## Development Environment Setup

### AI-Assisted Development with GitHub Copilot

For enhanced development experience, you can configure VS Code with the [AG2 WhatsApp Business API MCP Server](https://github.com/ag2-mcp-servers/whatsapp-business-api) to give GitHub Copilot better WhatsApp API knowledge.

#### Prerequisites

- VS Code with GitHub Copilot extension
- Node.js installed (required for npx):
  ```bash
  node --version
  ```

#### What It Provides

The MCP server gives Copilot:
- **Accurate WhatsApp API code generation**: Get proper code snippets for messages, buttons, lists
- **Structure validation**: Check if your interactive messages are correctly formatted
- **Best practices**: Recommendations for WhatsApp Business API patterns
- **Context-aware help**: Copilot understands WhatsApp API capabilities

#### Setup

The MCP server is already configured in `.vscode/mcp.json`. Just:

1. Set environment variables (same as above: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`)
2. Restart VS Code
3. Verify by opening Copilot Chat (`Ctrl+Shift+I`) and asking:
   ```
   @workspace What WhatsApp tools are available?
   ```

#### Using Copilot with MCP

**In Copilot Chat:**
```
Help me create a Python function to build an interactive button 
message with 3 options: View Profile, Check Strategy, Contact Manager
```

**Inline suggestions:**
```python
# Just start typing, Copilot will suggest complete WhatsApp structures
def send_menu_message(to):
    # Copilot autocompletes with proper WhatsApp interactive message
```

**Validate your code:**
```
Is this WhatsApp interactive message structure correct?
[paste your code]
```

#### Troubleshooting

- **MCP not working**: Ensure VS Code is completely restarted (close all windows)
- **Environment variables not found**: Check that `.env` file exists and contains all required variables
- **npx command fails**: Verify Node.js is installed (`node --version`)
- **Copilot not using MCP tools**: Ask explicitly "@workspace What WhatsApp tools are available?" to activate

## Notebooks

### `message_processor.ipynb`
Main processing notebook containing:
- All conversation flows (menu, strategy, post approval)

### `test_scenarios.ipynb` (Optional)
Testing notebook for:
- Simulating different message scenarios
- Testing conversation flows
- Debugging edge cases

## Features

### Message Processing
- Polls MongoDB for unprocessed messages
- Handles text, interactive (buttons/lists), and flow responses
- Updates conversation states automatically
- Logs all interactions

### Conversation Flows

1. **Main Menu**: Displays options when user sends a message
2. **Business Profile**: Shows restaurant details and account manager info
3. **Strategy Review**: Displays content strategy for approval/feedback
4. **Post Review**: Shows scheduled post for approval/feedback
5. **Account Manager Contact**: Creates support requests

### WhatsApp Message Types Supported

- Text messages
- Interactive button messages (up to 3 buttons)
- Interactive list messages (for 4+ options)
- WhatsApp Flows (for complex forms like feedback)
- Media messages (images with captions)

## Project Structure

```
whatsappbusinessapi-bot/
├── .env.test                 # Environment variables template
├── .gitignore                # Git ignore rules
├── README.md                 # This file
├── requirements.txt          # Python dependencies
├── message_processor.ipynb   # Main processing notebook (source of truth)
└── bot_cron.py              # Auto-generated from notebook via nbconvert
```

**Note:** The MCP server (configured in `.vscode/mcp.json`) is a development assistant for writing code with GitHub Copilot. Your Python cron job handles the actual bot operations.

## Error Handling

The cron job includes:
- Automatic retry logic for failed API calls
- Error logging to MongoDB
- Graceful handling of malformed messages
- Connection pooling for database efficiency

## Monitoring

- All message processing is logged with timestamps
- Failed operations are marked with `processing_error` field
- Conversation state transitions are tracked
- Support requests are logged for account manager follow-up

## Development

To add new conversation flows:
1. Define new conversation states in the constants
2. Add message handlers for the new states
3. Create WhatsApp message builders for responses
4. Update the main processing loop in `message_processor.ipynb`

## License

MIT
