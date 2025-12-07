/**
 * Azure Function for WhatsApp Webhook
 * * Responsibilities:
 * 1. Verify Webhook (GET)
 * 2. Receive Messages/Statuses (POST)
 * 3. Store raw data into MongoDB for the Python Logic to handle
 */

import { Schema as _Schema, model, connect } from 'mongoose';
import * as pb from '../generated/restropulse_pb.cjs';
import {
    RestaurantSchema,
    ContentStrategySchema,
    PostSchema,
    MessageLogSchema,
    SupportRequestSchema,
    WhatsAppFlowSchema
} from '../generated/mongoose-schemas.js';

const Schema = _Schema;

// ===== PROTOBUF ENUMS =====
const SubscriptionStatus = pb.SubscriptionStatus;
const ConversationState = pb.ConversationState;
const StrategyStatus = pb.StrategyStatus;
const PostStatus = pb.PostStatus;
const MessageDirection = pb.MessageDirection;
const MessageType = pb.MessageType;
const InteractiveType = pb.InteractiveType;
const ButtonAction = pb.ButtonAction;
const StrategyFeedbackTag = pb.StrategyFeedbackTag;
const PostFeedbackTag = pb.PostFeedbackTag;
const MessageContext = pb.MessageContext;
const MessageProcessingStatus = pb.MessageProcessingStatus;

// ===== WEBHOOK CONSTANTS =====

const WhatsAppObjectType = {
    WHATSAPP_BUSINESS_ACCOUNT: 'whatsapp_business_account'
};

const WebhookMode = {
    SUBSCRIBE: 'subscribe'
};

// Create Models
const Restaurant = model('Restaurant', RestaurantSchema);
const ContentStrategy = model('ContentStrategy', ContentStrategySchema);
const Post = model('Post', PostSchema);
const MessageLog = model('MessageLog', MessageLogSchema);
const SupportRequest = model('SupportRequest', SupportRequestSchema);
const WhatsAppFlow = model('WhatsAppFlow', WhatsAppFlowSchema);

// ===== MONGODB CONNECTION =====
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'MY_SECRET_TOKEN';

let isConnected = false;

async function connectToDatabase() {
    if (isConnected) {
        return;
    }

    await connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000
    });

    isConnected = true;
    console.log('Connected to MongoDB');
}

// ===== AZURE FUNCTION HANDLER =====
export default async function (context, req) {
    context.log('WhatsApp webhook triggered');

    try {
        // Ensure DB connection
        await connectToDatabase();

        // Handle GET request for WhatsApp verification
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];

            if (mode === WebhookMode.SUBSCRIBE && token === VERIFY_TOKEN) {
                context.log('Webhook verified successfully!');
                context.res = {
                    status: 200,
                    body: challenge
                };
                return;
            } else {
                context.log('Verification failed');
                context.res = {
                    status: 403,
                    body: 'Verification failed'
                };
                return;
            }
        }

        // Handle POST request for incoming messages
        if (req.method === 'POST') {
            const body = req.body;
            context.log('Incoming message:', JSON.stringify(body));

            if (body.object === WhatsAppObjectType.WHATSAPP_BUSINESS_ACCOUNT) {
                for (const entry of body.entry) {
                    for (const change of entry.changes) {
                        const value = change.value;

                        if (value.messages && value.messages.length > 0) {
                            const message = value.messages[0];
                            const from = message.from;

                            const messageTimestamp = message.timestamp
                                ? new Date(parseInt(message.timestamp) * 1000)
                                : new Date();

                            const logEntry = {
                                restaurant_whatsapp_id: from,
                                direction: MessageDirection.INBOUND,
                                message_type: message.type,
                                body: '',
                                processed: false,
                                timestamp: messageTimestamp
                            };

                            if (message.type === MessageType.TEXT) {
                                logEntry.body = message.text.body;
                            } else if (message.type === MessageType.INTERACTIVE) {
                                const interaction = message.interactive;
                                if (interaction.type === InteractiveType.LIST_REPLY) {
                                    logEntry.body = interaction.list_reply.id;
                                } else if (interaction.type === InteractiveType.BUTTON_REPLY) {
                                    logEntry.body = interaction.button_reply.id;
                                } else if (interaction.type === InteractiveType.NFM_REPLY) {
                                    logEntry.message_type = MessageType.FLOW_RESPONSE;
                                    logEntry.flow_data = JSON.parse(interaction.nfm_reply.response_json);
                                    logEntry.body = "FLOW_SUBMISSION";
                                }
                            }

                            await MessageLog.create(logEntry);
                            context.log(`Message saved from ${from} at ${messageTimestamp.toISOString()}`);
                        }
                    }
                }

                context.res = {
                    status: 200,
                    body: 'Message saved'
                };
                return;
            } else {
                context.res = {
                    status: 404,
                    body: 'Not a WhatsApp event'
                };
                return;
            }
        }

        // Method not allowed
        context.res = {
            status: 405,
            body: 'Method not allowed'
        };

    } catch (error) {
        context.log.error('Error saving message:', error);
        context.res = {
            status: 500,
            body: error.message
        };
    }
};
