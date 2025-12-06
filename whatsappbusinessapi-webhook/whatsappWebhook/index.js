/**
 * Azure Function for WhatsApp Webhook
 * * Responsibilities:
 * 1. Verify Webhook (GET)
 * 2. Receive Messages/Statuses (POST)
 * 3. Store raw data into MongoDB for the Python Logic to handle
 */

import { Schema as _Schema, model, connect } from 'mongoose';
const Schema = _Schema;

// ===== CONSTANTS & ENUMS =====

// Subscription Plans
const SubscriptionPlan = {
    BASIC: 'Basic',
    GROWTH: 'Growth',
    ENTERPRISE: 'Enterprise'
};

// Subscription Status
const SubscriptionStatus = {
    ACTIVE: 'Active',
    PAUSED: 'Paused',
    PAST_DUE: 'Past Due'
};

// Conversation States
const ConversationState = {
    IDLE: 'IDLE',
    ONBOARDING: 'ONBOARDING',
    AWAITING_STRATEGY_REVIEW: 'AWAITING_STRATEGY_REVIEW',
    PROVIDING_STRATEGY_FEEDBACK: 'PROVIDING_STRATEGY_FEEDBACK',
    AWAITING_POST_REVIEW: 'AWAITING_POST_REVIEW',
    PROVIDING_POST_FEEDBACK: 'PROVIDING_POST_FEEDBACK',
    MENU_SELECTION: 'MENU_SELECTION',
    SUPPORT_QUERY: 'SUPPORT_QUERY',
    FLOW_IN_PROGRESS: 'FLOW_IN_PROGRESS'
};

// Content Strategy Status
const StrategyStatus = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved',
    CHANGES_REQUESTED: 'Changes Requested'
};

// Post Status (includes approval + execution states)
const PostStatus = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    CHANGES_REQUESTED: 'Changes Requested',
    APPROVED: 'Approved',
    SCHEDULED: 'Scheduled',
    POSTED: 'Posted',
    FAILED: 'Failed'
};

// Message Direction
const MessageDirection = {
    INBOUND: 'INBOUND',
    OUTBOUND: 'OUTBOUND'
};

// Message Types
const MessageType = {
    TEXT: 'text',
    IMAGE: 'image',
    VIDEO: 'video',
    DOCUMENT: 'document',
    INTERACTIVE: 'interactive',
    FLOW_RESPONSE: 'flow_response'
};

// Interactive Message Types
const InteractiveType = {
    LIST_REPLY: 'list_reply',
    BUTTON_REPLY: 'button_reply',
    NFM_REPLY: 'nfm_reply'
};

// WhatsApp Event Object Types
const WhatsAppObjectType = {
    WHATSAPP_BUSINESS_ACCOUNT: 'whatsapp_business_account'
};

// Webhook Verification
const WebhookMode = {
    SUBSCRIBE: 'subscribe'
};

// Button Actions (Interactive Button Callbacks)
const ButtonAction = {
    // Menu navigation
    VIEW_PROFILE: 'btn_view_profile',
    CHECK_STRATEGY: 'btn_check_strategy',
    VIEW_NEXT_POST: 'btn_view_next_post',
    CONTACT_MANAGER: 'btn_contact_manager',
    
    // Strategy actions
    STRATEGY_APPROVE: 'btn_strategy_approve',
    STRATEGY_FEEDBACK: 'btn_strategy_feedback',
    
    // Post actions
    POST_APPROVE: 'btn_post_approve',
    POST_FEEDBACK: 'btn_post_feedback',
    
    // Navigation
    BACK_TO_MENU: 'btn_back_to_menu'
};

// Strategy Feedback Tags
const StrategyFeedbackTag = {
    FREQUENCY: 'feedback_posting_frequency',
    TIMING: 'feedback_posting_timing',
    TOPICS: 'feedback_content_topics',
    VARIETY: 'feedback_content_variety',
    OTHER: 'feedback_other'
};

// Post Feedback Tags
const PostFeedbackTag = {
    MEDIA: 'feedback_media_content',    
    CAPTION: 'feedback_caption_text',
    HASHTAGS: 'feedback_hashtags',
    TIMING: 'feedback_posting_time',
    OTHER: 'feedback_other'
};

// Message Context (What the message is about)
// Convention: INBOUND = user_*, OUTBOUND = bot_*
const MessageContext = {
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
    BOT_SUPPORT_CONFIRMATION: 'bot_support_confirmation',     // Bot confirmed manager will contact
    BOT_NOTIFICATION: 'bot_notification',           // Bot sent proactive notification
    BOT_ERROR: 'bot_error',                         // Bot sent error message
    BOT_HELP: 'bot_help'                            // Bot sent help/guidance
};

// ===== MONGOOSE SCHEMAS =====

// 1. Restaurant/User Schema
const RestaurantSchema = new Schema({
    whatsapp_id: { type: String, required: true, unique: true, index: true }, 
    business_name: { type: String, required: true },
    contact_person: { type: String },
    contact_number: { type: String },
    cuisine_type: { type: String },
    instagram_link: { type: String },
    
    subscription: {
        plan: { type: String, enum: Object.values(SubscriptionPlan), default: SubscriptionPlan.BASIC },
        status: { type: String, enum: Object.values(SubscriptionStatus) }
    },

    account_manager: {
        name: { type: String },
        contact_number: { type: String }
    },

    conversation_state: { type: String, default: ConversationState.IDLE },
    pending_bot_response: { type: Boolean, default: false, index: true },
    last_interaction_at: { type: Date, default: Date.now }
}, { timestamps: true });


// 2. Content Strategy Schema
const StrategySchema = new Schema({
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    cycle_start_date: { type: Date, required: true },
    cycle_end_date: { type: Date, required: true },
    
    summary_text: { type: String }, 
    
    // Detailed content type distribution
    post_breakdown: {
        menu_highlights: { type: Number, default: 0 },        // Dish showcases, menu items, food close-ups
        customer_reviews: { type: Number, default: 0 },       // Testimonials, ratings, customer experiences
        chef_specials: { type: Number, default: 0 },          // Chef recommendations, signature dishes
        restaurant_ambiance: { type: Number, default: 0 },    // Interior photos, seating areas, decor
        behind_the_scenes: { type: Number, default: 0 },      // Kitchen prep, cooking process, team at work
        cultural_events: { type: Number, default: 0 },        // Festivals, holidays, occasions (Diwali, Christmas, etc.)
        current_events: { type: Number, default: 0 },         // Trending topics, news tie-ins, viral moments
        offers_promotions: { type: Number, default: 0 },      // Discounts, deals, special offers, combo meals
        staff_spotlight: { type: Number, default: 0 },        // Employee features, team highlights, staff stories
        food_stories: { type: Number, default: 0 },           // Recipe origins, ingredient sourcing, culinary history
        user_generated_content: { type: Number, default: 0 }, // Reposted customer photos, tagged content
        other: { type: Number, default: 0 }                   // Miscellaneous content not fitting above categories
    },
    
    // Status Flow: Draft -> Pending Approval -> Changes Requested -> Approved
    status: { type: String, enum: Object.values(StrategyStatus), default: StrategyStatus.DRAFT, index: true },
    
    feedback_tags: [{ type: String }], 
    feedback_text: { type: String },
    
    notification_sent_at: { type: Date },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });


// 3. Post Schema
const PostSchema = new Schema({
    strategy_id: { type: Schema.Types.ObjectId, ref: 'Strategy' },
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
    
    scheduled_time: { type: Date },
    media_url: { type: String }, 
    caption: { type: String },
    
    // UPDATED: Aligned with StrategySchema + Execution states
    status: { 
        type: String, 
        enum: Object.values(PostStatus), 
        default: PostStatus.DRAFT 
    },
    
    feedback_tags: [{ type: String }], // Post-specific feedback tags
    rejection_reason: { type: String }, // Detailed feedback text
    
    notification_sent_at: { type: Date }, // When post was sent for approval
    approved_at: { type: Date } // Approval timestamp
});


// 4. Message Log Schema
const MessageLogSchema = new Schema({
    restaurant_whatsapp_id: { type: String, required: true, index: true },
    direction: { type: String, enum: Object.values(MessageDirection), required: true },
    
    // Supports: text, image, video, document, interactive, flow_response
    message_type: { type: String }, 
    
    // For text messages or JSON string of button payloads
    body: { type: String }, 
    
    // UPDATED: For handling Media Content
    // MongoDB stores the reference ID and URL. 
    // The Python script is responsible for downloading the binary using 'whatsapp_media_id' 
    // and uploading it to Cloud Storage, then saving the link in 'cloud_storage_url'.
    media_metadata: {
        whatsapp_media_id: { type: String },
        mime_type: { type: String },
        caption: { type: String },
        cloud_storage_url: { type: String } // Populated after Python script processes the upload
    },

    // Specifically for Flow responses
    flow_data: { type: Object }, 
    
    // Message context
    context: { type: String, enum: Object.values(MessageContext), index: true },
    
    // Related entity references for tracking
    related_strategy_id: { type: Schema.Types.ObjectId, ref: 'Strategy' },
    related_post_id: { type: Schema.Types.ObjectId, ref: 'Post' },
    related_support_request_id: { type: Schema.Types.ObjectId, ref: 'SupportRequest' },
    
    // Processing flags
    processed: { type: Boolean, default: false, index: true },
    bot_response_sent: { type: Boolean, default: false },
    processing_error: { type: String }, // Store any error that occurred
    
    timestamp: { type: Date, default: Date.now, index: true }
});

// 5. Support Request Schema
const SupportRequestSchema = new Schema({
    restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    restaurant_whatsapp_id: { type: String, required: true, index: true },
    
    request_type: { type: String, default: 'account_manager_contact' }, // Can extend for other types
    status: { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
    
    notes: { type: String }, // Internal notes for account manager
    
    created_at: { type: Date, default: Date.now },
    resolved_at: { type: Date }
});

// 6. WhatsApp Flow Schema
const WhatsAppFlowSchema = new Schema({
    flow_id: { type: String, required: true, unique: true }, // WhatsApp Flow ID
    flow_name: { type: String, required: true },
    purpose: { type: String, enum: ['strategy_feedback', 'post_feedback', 'onboarding', 'other'] },
    
    is_active: { type: Boolean, default: true },
    
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
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
                                if(interaction.type === InteractiveType.LIST_REPLY) {
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
