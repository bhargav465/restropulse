/**
 * Auto-generated Mongoose Schemas
 * Generated from: shared-schemas/restropulse.proto
 * DO NOT EDIT MANUALLY - This file is auto-generated
 * Run: npm run generate:schemas to regenerate
 */

import { Schema } from 'mongoose';
import * as pb from './restropulse_pb.cjs';

// ===== PROTOBUF ENUM REFERENCES =====
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

// ===== MONGOOSE SCHEMAS =====

// AccountManager Schema
const AccountManagerSchema = new Schema({
  name: { type: String },
  email: { type: String },
  contact_number: { type: String },
  restaurant_ids: [{ type: String }],
}, { timestamps: true });

// SubscriptionPlan Schema
const SubscriptionPlanSchema = new Schema({
  name: { type: String },
  description: { type: String },
  monthly_price: { type: Number },
  annual_price: { type: Number },
  posts_per_month: { type: Number },
  strategy_reviews_per_month: { type: Number },
  priority_support: { type: Boolean },
  custom_content: { type: Boolean },
  analytics_dashboard: { type: Boolean },
}, { timestamps: true });

// Subscription Schema
const SubscriptionSchema = new Schema({
  restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
  plan_id: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan' },
  status: { type: String, enum: ['ACTIVE', 'PAUSED', 'PAST_DUE'] },
  start_date: { type: Date, default: Date.now },
  next_billing_date: { type: Date, default: Date.now },
}, { timestamps: true });

// Restaurant Schema
const RestaurantSchema = new Schema({
  whatsapp_id: { type: String, required: true, unique: true, index: true },
  business_name: { type: String, required: true },
  cuisine_type: { type: String },
  contact_person: { type: String },
  contact_email: { type: String },
  contact_number: { type: String },
  instagram_link: { type: String },
  account_manager_id: { type: Schema.Types.ObjectId, ref: 'AccountManager' },
  subscription_id: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  conversation_state: { type: String, enum: ['IDLE', 'ONBOARDING', 'AWAITING_STRATEGY_REVIEW', 'PROVIDING_STRATEGY_FEEDBACK', 'AWAITING_POST_REVIEW', 'PROVIDING_POST_FEEDBACK', 'MENU_SELECTION', 'SUPPORT_QUERY', 'FLOW_IN_PROGRESS'], default: 'IDLE' },
  last_interaction_at: { type: Date, default: Date.now },
}, { timestamps: true });

RestaurantSchema.index({ whatsapp_id: 1 });


// ContentStrategy Schema
const ContentStrategySchema = new Schema({
  restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
  cycle_start_date: { type: Date, default: Date.now },
  cycle_end_date: { type: Date, default: Date.now },
  summary_text: { type: String },
  post_breakdown: {
    menu_highlights: { type: Number, default: 0 },
    customer_reviews: { type: Number, default: 0 },
    chef_specials: { type: Number, default: 0 },
    restaurant_ambiance: { type: Number, default: 0 },
    behind_the_scenes: { type: Number, default: 0 },
    seasonal_events: { type: Number, default: 0 },
    trending_discussions: { type: Number, default: 0 },
    miscellaneous: { type: Number, default: 0 },
  },
  content_calendar: {
    scheduled_posts: [{
    post_type: { type: String },
    day_of_month: { type: Number },
    day_of_week: { type: String },
    preferred_time: { type: String },
    rationale: { type: String },
  }],
    posts_per_week: { type: Number, default: 0 },
    posts_on_weekdays: { type: Number, default: 0 },
    posts_on_weekends: { type: Number, default: 0 },
  },
  total_posts: { type: Number },
  notification_sent_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CHANGES_REQUESTED'], default: 'DRAFT', index: true },
  approved_at: { type: Date, default: Date.now },
  feedback_text: { type: String },
  feedback_tags: [{ type: String }],
}, { timestamps: true });

ContentStrategySchema.index({ restaurant_id: 1 });
ContentStrategySchema.index({ status: 1 });


// Post Schema
const PostSchema = new Schema({
  restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
  strategy_id: { type: Schema.Types.ObjectId, ref: 'ContentStrategy' },
  caption: { type: String },
  hashtags: [{ type: String }],
  media_url: { type: String },
  media_type: { type: String },
  scheduled_date: { type: Date, default: Date.now },
  notification_sent_at: { type: Date, default: Date.now },
  status: { type: String, enum: ['POST_DRAFT', 'POST_PENDING_APPROVAL', 'POST_CHANGES_REQUESTED', 'POST_APPROVED', 'SCHEDULED', 'POSTED', 'FAILED'], default: 'POST_DRAFT', index: true },
  approved_at: { type: Date, default: Date.now },
  feedback_text: { type: String },
  feedback_tags: [{ type: String }],
  posted_at: { type: Date, default: Date.now },
}, { timestamps: true });

PostSchema.index({ restaurant_id: 1 });
PostSchema.index({ strategy_id: 1 });
PostSchema.index({ status: 1 });


// MessageLog Schema
const MessageLogSchema = new Schema({
  restaurant_whatsapp_id: { type: String, required: true, index: true },
  direction: { type: String, enum: ['INBOUND', 'OUTBOUND'] },
  message_type: { type: String, enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'INTERACTIVE', 'FLOW_RESPONSE'] },
  body: { type: String },
  media_url: { type: String },
  whatsapp_media_id: { type: String },
  mime_type: { type: String },
  media_caption: { type: String },
  cloud_storage_url: { type: String },
  interactive_data: {
    type: { type: String },
    button_id: { type: String },
    list_id: { type: String },
    title: { type: String },
    description: { type: String },
  },
  flow_response_data: {
    flow_token: { type: String },
  },
  context: { type: String, enum: ['USER_SPONTANEOUS', 'USER_MENU_REQUEST', 'USER_PROFILE_VIEW', 'USER_STRATEGY_VIEW', 'USER_POST_VIEW', 'USER_CONTACT_MANAGER', 'USER_BACK_TO_MENU', 'USER_STRATEGY_APPROVE', 'USER_STRATEGY_FEEDBACK_START', 'USER_STRATEGY_FEEDBACK_SUBMIT', 'USER_POST_APPROVE', 'USER_POST_FEEDBACK_START', 'USER_POST_FEEDBACK_SUBMIT', 'BOT_MENU', 'BOT_PROFILE', 'BOT_STRATEGY_DISPLAY', 'BOT_POST_DISPLAY', 'BOT_SUPPORT_CONFIRMATION', 'BOT_STRATEGY_APPROVED', 'BOT_POST_APPROVED', 'BOT_FEEDBACK_RECEIVED'], index: true },
  processing_status: { type: String, enum: ['RECEIVED', 'SAVED_TO_DB', 'PROCESSING', 'ACTED_UPON', 'SENDING', 'SENT_SUCCESSFULLY', 'SEND_FAILED', 'REQUIRES_HUMAN_ATTENTION'] },
  processing_error: { type: String },
  related_strategy_id: { type: String },
  related_post_id: { type: String },
  related_support_request_id: { type: String },
  timestamp: { type: Date, index: true },
}, { timestamps: true });

MessageLogSchema.index({ restaurant_whatsapp_id: 1 });
MessageLogSchema.index({ context: 1 });
MessageLogSchema.index({ timestamp: 1 });


// SupportRequest Schema
const SupportRequestSchema = new Schema({
  restaurant_id: { type: Schema.Types.ObjectId, ref: 'Restaurant' },
  restaurant_whatsapp_id: { type: String, required: true, index: true },
  request_type: { type: String },
  description: { type: String },
  status: { type: String },
  resolved_at: { type: Date, default: Date.now },
}, { timestamps: true });

SupportRequestSchema.index({ restaurant_whatsapp_id: 1 });


// WhatsAppFlow Schema
const WhatsAppFlowSchema = new Schema({
  name: { type: String },
  flow_id: { type: String, unique: true },
  flow_token: { type: String },
  screen_id: { type: String },
  purpose: { type: String },
  is_active: { type: Boolean },
}, { timestamps: true });

// ===== EXPORTS =====
export {
  AccountManagerSchema,
  SubscriptionPlanSchema,
  SubscriptionSchema,
  RestaurantSchema,
  ContentStrategySchema,
  PostSchema,
  MessageLogSchema,
  SupportRequestSchema,
  WhatsAppFlowSchema,
};
