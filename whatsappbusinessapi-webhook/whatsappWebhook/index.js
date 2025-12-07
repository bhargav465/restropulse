/**
 * Azure Function for WhatsApp Webhook
 * * Responsibilities:
 * 1. Verify Webhook (GET)
 * 2. Receive Messages/Statuses (POST)
 * 3. Store raw data into MongoDB for the Python Logic to handle
 */

import { Schema as _Schema, model, connect } from 'mongoose';
import * as pb from '../generated/restropulse_pb.js';
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
const MessageResolutionStatus = pb.MessageResolutionStatus;

// ===== CONSTANTS & ENUMS =====

// WhatsApp Event Object Types
const WhatsAppObjectType = {
    WHATSAPP_BUSINESS_ACCOUNT: 'whatsapp_business_account'
};

// Webhook Verification
const WebhookMode = {
    SUBSCRIBE: 'subscribe'
};

// Legacy Message Context object (now imported from protobuf above)
// Kept for reference - actual values come from pb.MessageContext
const MessageContextLegacy = {
    // ===== INBOUND (User → Bot) =====
    // User-initiated messages
    USER_SPONTANEOUS: 'user_spontaneous',           // User sent unprompted message
    USER_MENU_REQUEST: 'user_menu_request',         // User asked for menu

    // Menu navigation
    USER_PROFILE_VIEW: 'user_profile_view',         // User clicked "View Profile"
    USER_STRATEGY_VIEW: 'user_strategy_view',       // User clicked "Check Strategy"
    USER_POST_VIEW: 'user_post_view',               // User clicked "View Next Post"
    USER_CONTACT_MANAGER: 'user_contact_manager',   // User clicked "Contact Manager"
    USER_BACK_TO_MENU: 'user_back_to_menu',         // User clicked "Back to Menu"

    // Strategy actions
    USER_STRATEGY_APPROVE: 'user_strategy_approve',           // User approved strategy
    USER_STRATEGY_FEEDBACK_START: 'user_strategy_feedback',   // User clicked "Provide Feedback"
    USER_STRATEGY_FEEDBACK_SUBMIT: 'user_strategy_feedback_submit', // User submitted feedback flow

    // Post actions
    USER_POST_APPROVE: 'user_post_approve',                   // User approved post
    USER_POST_FEEDBACK_START: 'user_post_feedback',           // User clicked "Request Changes"
    USER_POST_FEEDBACK_SUBMIT: 'user_post_feedback_submit',   // User submitted feedback flow

    // ===== OUTBOUND (Bot → User) =====
    // Menu and navigation
    BOT_MENU: 'bot_menu',                           // Bot sent main menu
    BOT_PROFILE: 'bot_profile',                     // Bot sent profile info

    // Strategy flow
    BOT_STRATEGY_DISPLAY: 'bot_strategy_display',   // Bot sent strategy for review
    BOT_STRATEGY_APPROVED: 'bot_strategy_approved', // Bot confirmed strategy approval
    BOT_STRATEGY_FEEDBACK_RECEIVED: 'bot_strategy_feedback_received', // Bot confirmed feedback received

    // Post flow
    BOT_POST_DISPLAY: 'bot_post_display',           // Bot sent post for review
    BOT_POST_APPROVED: 'bot_post_approved',         // Bot confirmed post approval
    BOT_POST_FEEDBACK_RECEIVED: 'bot_post_feedback_received',   // Bot confirmed feedback received

    // Support and notifications
    BOT_SUPPORT_CONFIRMATION: 'bot_support_confirmation',
    BOT_NOTIFICATION: 'bot_notification',
    BOT_ERROR: 'bot_error',
    BOT_HELP: 'bot_help'
};

// ===== SCHEMA EXTENSIONS =====
// Extend generated schemas with webhook-specific fields not in protobuf

// Restaurant extensions
RestaurantSchema.add({
    contact_person: { type: String },
    pending_bot_response: { type: Boolean, default: false, index: true }
});

// Strategy extensions (rename to match model name)
const StrategySchema = ContentStrategySchema;
StrategySchema.add({
    notification_sent_at: { type: Date }
});

// Post extensions
PostSchema.add({
    scheduled_time: { type: Date },
    rejection_reason: { type: String },
    notification_sent_at: { type: Date }
});

// MessageLog extensions
MessageLogSchema.add({
    // Media metadata for webhook-specific handling
    media_metadata: {
        whatsapp_media_id: { type: String },
        mime_type: { type: String },
        caption: { type: String },
        cloud_storage_url: { type: String }
    },
    // Flow data stored as object
    flow_data: { type: Object },
    // Related entity references
    related_strategy_id: { type: Schema.Types.ObjectId, ref: 'Strategy' },
    related_post_id: { type: Schema.Types.ObjectId, ref: 'Post' },
    related_support_request_id: { type: Schema.Types.ObjectId, ref: 'SupportRequest' },
    // Processing flag for webhook
    processed: { type: Boolean, default: false, index: true }
});

// SupportRequest extensions
SupportRequestSchema.add({
    notes: { type: String }
});

// WhatsAppFlow extensions
WhatsAppFlowSchema.add({
    flow_name: { type: String, required: true },
    is_active: { type: Boolean, default: true }
});

// Create Models
const Restaurant = model('Restaurant', RestaurantSchema);
const Strategy = model('Strategy', StrategySchema);
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
