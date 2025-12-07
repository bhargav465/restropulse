"""
Auto-generated PyMongo Schema Validators
Generated from: shared-schemas/restropulse.proto
DO NOT EDIT MANUALLY - This file is auto-generated
Run: python scripts/generate-pymongo-schemas.py to regenerate
"""

from typing import Dict, Any, List
from datetime import datetime

# Import protobuf enums for value reference
try:
    from generated import restropulse_pb2 as pb
except ImportError:
    print("Warning: Could not import protobuf definitions. Enum validation may be limited.")
    pb = None

# ===== ENUM VALUES =====

SUBSCRIPTIONSTATUS_VALUES = [
    'ACTIVE',
    'PAUSED',
    'PAST_DUE',
]

CONVERSATIONSTATE_VALUES = [
    'IDLE',
    'ONBOARDING',
    'AWAITING_STRATEGY_REVIEW',
    'PROVIDING_STRATEGY_FEEDBACK',
    'AWAITING_POST_REVIEW',
    'PROVIDING_POST_FEEDBACK',
    'MENU_SELECTION',
    'SUPPORT_QUERY',
    'FLOW_IN_PROGRESS',
]

STRATEGYSTATUS_VALUES = [
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'CHANGES_REQUESTED',
]

POSTSTATUS_VALUES = [
    'POST_DRAFT',
    'POST_PENDING_APPROVAL',
    'POST_CHANGES_REQUESTED',
    'POST_APPROVED',
    'SCHEDULED',
    'POSTED',
    'FAILED',
]

MESSAGEDIRECTION_VALUES = [
    'INBOUND',
    'OUTBOUND',
]

MESSAGETYPE_VALUES = [
    'TEXT',
    'IMAGE',
    'VIDEO',
    'DOCUMENT',
    'INTERACTIVE',
    'FLOW_RESPONSE',
]

INTERACTIVETYPE_VALUES = [
    'LIST_REPLY',
    'BUTTON_REPLY',
    'NFM_REPLY',
]

BUTTONACTION_VALUES = [
    'VIEW_PROFILE',
    'CHECK_STRATEGY',
    'VIEW_NEXT_POST',
    'CONTACT_MANAGER',
    'STRATEGY_APPROVE',
    'STRATEGY_FEEDBACK',
    'POST_APPROVE',
    'POST_FEEDBACK',
    'BACK_TO_MENU',
]

STRATEGYFEEDBACKTAG_VALUES = [
    'FREQUENCY',
    'TIMING',
    'TOPICS',
    'VARIETY',
    'OTHER',
]

POSTFEEDBACKTAG_VALUES = [
    'MEDIA',
    'CAPTION',
    'HASHTAGS',
    'POST_TIMING',
    'POST_OTHER',
]

MESSAGECONTEXT_VALUES = [
    'USER_SPONTANEOUS',
    'USER_MENU_REQUEST',
    'USER_PROFILE_VIEW',
    'USER_STRATEGY_VIEW',
    'USER_POST_VIEW',
    'USER_CONTACT_MANAGER',
    'USER_BACK_TO_MENU',
    'USER_STRATEGY_APPROVE',
    'USER_STRATEGY_FEEDBACK_START',
    'USER_STRATEGY_FEEDBACK_SUBMIT',
    'USER_POST_APPROVE',
    'USER_POST_FEEDBACK_START',
    'USER_POST_FEEDBACK_SUBMIT',
    'BOT_MENU',
    'BOT_PROFILE',
    'BOT_STRATEGY_DISPLAY',
    'BOT_POST_DISPLAY',
    'BOT_SUPPORT_CONFIRMATION',
    'BOT_STRATEGY_APPROVED',
    'BOT_POST_APPROVED',
    'BOT_FEEDBACK_RECEIVED',
]

MESSAGEPROCESSINGSTATUS_VALUES = [
    'RECEIVED',
    'SAVED_TO_DB',
    'PROCESSING',
    'ACTED_UPON',
    'SENDING',
    'SENT_SUCCESSFULLY',
    'SEND_FAILED',
    'REQUIRES_HUMAN_ATTENTION',
]


# ===== JSON SCHEMA VALIDATORS =====

# AccountManager Validator
ACCOUNTMANAGER_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "name": {
                "bsonType": "string"
            },
            "email": {
                "bsonType": "string"
            },
            "contact_number": {
                "bsonType": "string"
            },
            "restaurant_ids": {
                "bsonType": "array",
                "items": { "bsonType": "string" }
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# SubscriptionPlan Validator
SUBSCRIPTIONPLAN_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "name": {
                "bsonType": "string"
            },
            "description": {
                "bsonType": "string"
            },
            "monthly_price": {
                "bsonType": "double"
            },
            "annual_price": {
                "bsonType": "double"
            },
            "posts_per_month": {
                "bsonType": "int"
            },
            "strategy_reviews_per_month": {
                "bsonType": "int"
            },
            "priority_support": {
                "bsonType": "bool"
            },
            "custom_content": {
                "bsonType": "bool"
            },
            "analytics_dashboard": {
                "bsonType": "bool"
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# Subscription Validator
SUBSCRIPTION_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "restaurant_id": {
                "bsonType": "string",
                "description": "Reference to Restaurant collection"
            },
            "plan_id": {
                "bsonType": "string",
                "description": "Reference to SubscriptionPlan collection"
            },
            "status": {
                "bsonType": "string",
                "enum": ["ACTIVE", "PAUSED", "PAST_DUE"],
                "description": "SubscriptionStatus enum value"
            },
            "start_date": {
                "bsonType": "date"
            },
            "next_billing_date": {
                "bsonType": "date"
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# Restaurant Validator
RESTAURANT_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
            "whatsapp_id",
            "business_name",
        ],
        "properties": {
            "whatsapp_id": {
                "bsonType": "string"
            },
            "business_name": {
                "bsonType": "string"
            },
            "cuisine_type": {
                "bsonType": "string"
            },
            "contact_person": {
                "bsonType": "string"
            },
            "contact_email": {
                "bsonType": "string"
            },
            "contact_number": {
                "bsonType": "string"
            },
            "instagram_link": {
                "bsonType": "string"
            },
            "account_manager_id": {
                "bsonType": "string",
                "description": "Reference to AccountManager collection"
            },
            "subscription_id": {
                "bsonType": "string",
                "description": "Reference to Subscription collection"
            },
            "conversation_state": {
                "bsonType": "string",
                "enum": ["IDLE", "ONBOARDING", "AWAITING_STRATEGY_REVIEW", "PROVIDING_STRATEGY_FEEDBACK", "AWAITING_POST_REVIEW", "PROVIDING_POST_FEEDBACK", "MENU_SELECTION", "SUPPORT_QUERY", "FLOW_IN_PROGRESS"],
                "description": "ConversationState enum value"
            },
            "last_interaction_at": {
                "bsonType": "date"
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# ContentStrategy Validator
CONTENTSTRATEGY_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "restaurant_id": {
                "bsonType": "string",
                "description": "Reference to Restaurant collection"
            },
            "cycle_start_date": {
                "bsonType": "date"
            },
            "cycle_end_date": {
                "bsonType": "date"
            },
            "summary_text": {
                "bsonType": "string"
            },
            "post_breakdown":  {
                    "bsonType": "object",
                    "properties": {
                        "menu_highlights": {
                            "bsonType": "int"
                        },
                        "customer_reviews": {
                            "bsonType": "int"
                        },
                        "chef_specials": {
                            "bsonType": "int"
                        },
                        "restaurant_ambiance": {
                            "bsonType": "int"
                        },
                        "behind_the_scenes": {
                            "bsonType": "int"
                        },
                        "seasonal_events": {
                            "bsonType": "int"
                        },
                        "trending_discussions": {
                            "bsonType": "int"
                        },
                        "miscellaneous": {
                            "bsonType": "int"
                        },
                    }
                }
            },
            "content_calendar":  {
                    "bsonType": "object",
                    "properties": {
                        "scheduled_posts": {
                            "bsonType": "object"
                        },
                        "posts_per_week": {
                            "bsonType": "int"
                        },
                        "posts_on_weekdays": {
                            "bsonType": "int"
                        },
                        "posts_on_weekends": {
                            "bsonType": "int"
                        },
                    }
                }
            },
            "total_posts": {
                "bsonType": "int"
            },
            "notification_sent_at": {
                "bsonType": "date"
            },
            "status": {
                "bsonType": "string",
                "enum": ["DRAFT", "PENDING_APPROVAL", "APPROVED", "CHANGES_REQUESTED"],
                "description": "StrategyStatus enum value"
            },
            "approved_at": {
                "bsonType": "date"
            },
            "feedback_text": {
                "bsonType": "string"
            },
            "feedback_tags": {
                "bsonType": "array",
                "items": { "bsonType": "string" }
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# Post Validator
POST_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "restaurant_id": {
                "bsonType": "string",
                "description": "Reference to Restaurant collection"
            },
            "strategy_id": {
                "bsonType": "string",
                "description": "Reference to ContentStrategy collection"
            },
            "caption": {
                "bsonType": "string"
            },
            "hashtags": {
                "bsonType": "array",
                "items": { "bsonType": "string" }
            },
            "media_url": {
                "bsonType": "string"
            },
            "media_type": {
                "bsonType": "string"
            },
            "scheduled_date": {
                "bsonType": "date"
            },
            "notification_sent_at": {
                "bsonType": "date"
            },
            "status": {
                "bsonType": "string",
                "enum": ["POST_DRAFT", "POST_PENDING_APPROVAL", "POST_CHANGES_REQUESTED", "POST_APPROVED", "SCHEDULED", "POSTED", "FAILED"],
                "description": "PostStatus enum value"
            },
            "approved_at": {
                "bsonType": "date"
            },
            "feedback_text": {
                "bsonType": "string"
            },
            "feedback_tags": {
                "bsonType": "array",
                "items": { "bsonType": "string" }
            },
            "posted_at": {
                "bsonType": "date"
            },
            "created_at": {
                "bsonType": "date"
            },
            "updated_at": {
                "bsonType": "date"
            },
        }
    }
}

# MessageLog Validator
MESSAGELOG_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
            "restaurant_whatsapp_id",
            "direction",
        ],
        "properties": {
            "restaurant_whatsapp_id": {
                "bsonType": "string"
            },
            "direction": {
                "bsonType": "string",
                "enum": ["INBOUND", "OUTBOUND"],
                "description": "MessageDirection enum value"
            },
            "message_type": {
                "bsonType": "string",
                "enum": ["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "INTERACTIVE", "FLOW_RESPONSE"],
                "description": "MessageType enum value"
            },
            "body": {
                "bsonType": "string"
            },
            "media_url": {
                "bsonType": "string"
            },
            "whatsapp_media_id": {
                "bsonType": "string"
            },
            "mime_type": {
                "bsonType": "string"
            },
            "media_caption": {
                "bsonType": "string"
            },
            "cloud_storage_url": {
                "bsonType": "string"
            },
            "interactive_data":  {
                    "bsonType": "object",
                    "properties": {
                        "type": {
                            "bsonType": "string"
                        },
                        "button_id": {
                            "bsonType": "string"
                        },
                        "list_id": {
                            "bsonType": "string"
                        },
                        "title": {
                            "bsonType": "string"
                        },
                        "description": {
                            "bsonType": "string"
                        },
                    }
                }
            },
            "flow_response_data":  {
                    "bsonType": "object",
                    "properties": {
                        "flow_token": {
                            "bsonType": "string"
                        },
                    }
                }
            },
            "context": {
                "bsonType": "string",
                "enum": ["USER_SPONTANEOUS", "USER_MENU_REQUEST", "USER_PROFILE_VIEW", "USER_STRATEGY_VIEW", "USER_POST_VIEW", "USER_CONTACT_MANAGER", "USER_BACK_TO_MENU", "USER_STRATEGY_APPROVE", "USER_STRATEGY_FEEDBACK_START", "USER_STRATEGY_FEEDBACK_SUBMIT", "USER_POST_APPROVE", "USER_POST_FEEDBACK_START", "USER_POST_FEEDBACK_SUBMIT", "BOT_MENU", "BOT_PROFILE", "BOT_STRATEGY_DISPLAY", "BOT_POST_DISPLAY", "BOT_SUPPORT_CONFIRMATION", "BOT_STRATEGY_APPROVED", "BOT_POST_APPROVED", "BOT_FEEDBACK_RECEIVED"],
                "description": "MessageContext enum value"
            },
            "processing_status": {
                "bsonType": "string",
                "enum": ["RECEIVED", "SAVED_TO_DB", "PROCESSING", "ACTED_UPON", "SENDING", "SENT_SUCCESSFULLY", "SEND_FAILED", "REQUIRES_HUMAN_ATTENTION"],
                "description": "MessageProcessingStatus enum value"
            },
            "processing_error": {
                "bsonType": "string"
            },
            "related_strategy_id": {
                "bsonType": "string"
            },
            "related_post_id": {
                "bsonType": "string"
            },
            "related_support_request_id": {
                "bsonType": "string"
            },
            "timestamp": {
                "bsonType": "date"
            },
            "created_at": {
                "bsonType": "date"
            },
        }
    }
}

# SupportRequest Validator
SUPPORTREQUEST_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
            "restaurant_whatsapp_id",
        ],
        "properties": {
            "restaurant_id": {
                "bsonType": "string",
                "description": "Reference to Restaurant collection"
            },
            "restaurant_whatsapp_id": {
                "bsonType": "string"
            },
            "request_type": {
                "bsonType": "string"
            },
            "description": {
                "bsonType": "string"
            },
            "status": {
                "bsonType": "string"
            },
            "created_at": {
                "bsonType": "date"
            },
            "resolved_at": {
                "bsonType": "date"
            },
        }
    }
}

# WhatsAppFlow Validator
WHATSAPPFLOW_VALIDATOR = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": [
        ],
        "properties": {
            "name": {
                "bsonType": "string"
            },
            "flow_id": {
                "bsonType": "string"
            },
            "flow_token": {
                "bsonType": "string"
            },
            "screen_id": {
                "bsonType": "string"
            },
            "purpose": {
                "bsonType": "string"
            },
            "is_active": {
                "bsonType": "bool"
            },
            "created_at": {
                "bsonType": "date"
            },
        }
    }
}

# ===== INDEXES =====

COLLECTION_INDEXES = {
    "restaurants": [
        ("whatsapp_id", {"unique": true}),
    ],
    "contentstrategys": [
        ("restaurant_id", {"unique": false}),
        ("status", {"unique": false}),
    ],
    "posts": [
        ("restaurant_id", {"unique": false}),
        ("strategy_id", {"unique": false}),
        ("status", {"unique": false}),
    ],
    "messagelogs": [
        ("restaurant_whatsapp_id", {"unique": false}),
        ("context", {"unique": false}),
        ("timestamp", {"unique": false}),
    ],
    "supportrequests": [
        ("restaurant_whatsapp_id", {"unique": false}),
    ],
    "whatsappflows": [
    ],
}


# ===== HELPER FUNCTIONS =====

def apply_validators(db):
    """
    Apply JSON Schema validators to all collections.
    
    Args:
        db: PyMongo database instance
    """
    validators = {
        "accountmanagers": ACCOUNTMANAGER_VALIDATOR,
        "subscriptionplans": SUBSCRIPTIONPLAN_VALIDATOR,
        "subscriptions": SUBSCRIPTION_VALIDATOR,
        "restaurants": RESTAURANT_VALIDATOR,
        "contentstrategys": CONTENTSTRATEGY_VALIDATOR,
        "posts": POST_VALIDATOR,
        "messagelogs": MESSAGELOG_VALIDATOR,
        "supportrequests": SUPPORTREQUEST_VALIDATOR,
        "whatsappflows": WHATSAPPFLOW_VALIDATOR,
    }
    
    for collection_name, validator in validators.items():
        try:
            db.command({
                "collMod": collection_name,
                "validator": validator,
                "validationLevel": "moderate",  # moderate = apply to inserts and updates
                "validationAction": "warn"  # warn = log violations but allow writes
            })
            print(f"[SUCCESS] Applied validator to {collection_name}")
        except Exception as e:
            print(f"[ERROR] Error applying validator to {collection_name}: {e}")


def create_indexes(db):
    """
    Create indexes for all collections.
    
    Args:
        db: PyMongo database instance
    """
    for collection_name, indexes in COLLECTION_INDEXES.items():
        collection = db[collection_name]
        
        for field, options in indexes:
            try:
                collection.create_index([(field, 1)], **options)
                print(f"[SUCCESS] Created index on {collection_name}.{field}")
            except Exception as e:
                print(f"[ERROR] Error creating index on {collection_name}.{field}: {e}")


def setup_database(db):
    """
    Complete database setup: apply validators and create indexes.
    
    Args:
        db: PyMongo database instance
    """
    print("Setting up database schema...")
    apply_validators(db)
    create_indexes(db)
    print("Database setup complete!")


# Example usage:
if __name__ == "__main__":
    from pymongo import MongoClient
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client[os.getenv("MONGODB_DATABASE", "restropulse")]
    
    setup_database(db)
