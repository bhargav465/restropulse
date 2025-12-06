# Import required libraries
import os
import time
import requests
import logging
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO')),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

print("✅ Libraries imported successfully")

# Configuration
MONGODB_URI = os.getenv('MONGODB_URI')
WHATSAPP_API_URL = os.getenv('WHATSAPP_API_URL', 'https://graph.facebook.com/v18.0')
WHATSAPP_PHONE_NUMBER_ID = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
WHATSAPP_ACCESS_TOKEN = os.getenv('WHATSAPP_ACCESS_TOKEN')
CRON_INTERVAL = int(os.getenv('CRON_INTERVAL_SECONDS', '5'))

# Verify configuration
assert MONGODB_URI, "MONGODB_URI not set"
assert WHATSAPP_PHONE_NUMBER_ID, "WHATSAPP_PHONE_NUMBER_ID not set"
assert WHATSAPP_ACCESS_TOKEN, "WHATSAPP_ACCESS_TOKEN not set"

print(f"✅ Configuration loaded")
print(f"   MongoDB: {MONGODB_URI[:30]}...")
print(f"   WhatsApp Phone ID: {WHATSAPP_PHONE_NUMBER_ID}")
print(f"   Polling Interval: {CRON_INTERVAL}s")

# Connect to MongoDB
client = MongoClient(MONGODB_URI)
db = client.get_default_database()

# Collections
restaurants = db['restaurants']
message_logs = db['messagelogs']
strategies = db['strategies']
posts = db['posts']
support_requests = db['supportrequests']

# Test connection
try:
    client.admin.command('ping')
    print("✅ Connected to MongoDB")
    print(f"   Database: {db.name}")
except Exception as e:
    print(f"❌ MongoDB connection failed: {e}")

# Conversation States
class ConversationState:
    IDLE = 'IDLE'
    ONBOARDING = 'ONBOARDING'
    MENU_SELECTION = 'MENU_SELECTION'
    AWAITING_STRATEGY_REVIEW = 'AWAITING_STRATEGY_REVIEW'
    PROVIDING_STRATEGY_FEEDBACK = 'PROVIDING_STRATEGY_FEEDBACK'
    AWAITING_POST_REVIEW = 'AWAITING_POST_REVIEW'
    PROVIDING_POST_FEEDBACK = 'PROVIDING_POST_FEEDBACK'
    SUPPORT_QUERY = 'SUPPORT_QUERY'
    FLOW_IN_PROGRESS = 'FLOW_IN_PROGRESS'

# Button Actions
class ButtonAction:
    VIEW_PROFILE = 'btn_view_profile'
    CHECK_STRATEGY = 'btn_check_strategy'
    VIEW_NEXT_POST = 'btn_view_next_post'
    CONTACT_MANAGER = 'btn_contact_manager'
    STRATEGY_APPROVE = 'btn_strategy_approve'
    STRATEGY_FEEDBACK = 'btn_strategy_feedback'
    POST_APPROVE = 'btn_post_approve'
    POST_FEEDBACK = 'btn_post_feedback'
    BACK_TO_MENU = 'btn_back_to_menu'

# Message Context
class MessageContext:
    # Inbound
    USER_SPONTANEOUS = 'user_spontaneous'
    USER_MENU_REQUEST = 'user_menu_request'
    USER_PROFILE_VIEW = 'user_profile_view'
    USER_STRATEGY_VIEW = 'user_strategy_view'
    USER_POST_VIEW = 'user_post_view'
    USER_CONTACT_MANAGER = 'user_contact_manager'
    USER_STRATEGY_APPROVE = 'user_strategy_approve'
    USER_POST_APPROVE = 'user_post_approve'
    
    # Outbound
    BOT_MENU = 'bot_menu'
    BOT_PROFILE = 'bot_profile'
    BOT_STRATEGY_DISPLAY = 'bot_strategy_display'
    BOT_POST_DISPLAY = 'bot_post_display'
    BOT_SUPPORT_CONFIRMATION = 'bot_support_confirmation'

print("✅ Constants defined")

def send_whatsapp_message(to, message_type, content):
    """
    Send a WhatsApp message
    
    Args:
        to: Recipient WhatsApp ID
        message_type: 'text', 'interactive_button', 'interactive_list', 'image'
        content: Message content (structure varies by type)
    """
    url = f"{WHATSAPP_API_URL}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        'Authorization': f'Bearer {WHATSAPP_ACCESS_TOKEN}',
        'Content-Type': 'application/json'
    }
    
    payload = {
        'messaging_product': 'whatsapp',
        'to': to
    }
    
    if message_type == 'text':
        payload['type'] = 'text'
        payload['text'] = {'body': content}
    elif message_type == 'interactive_button':
        payload['type'] = 'interactive'
        payload['interactive'] = content
    elif message_type == 'interactive_list':
        payload['type'] = 'interactive'
        payload['interactive'] = content
    elif message_type == 'image':
        payload['type'] = 'image'
        payload['image'] = content
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        logger.info(f"Message sent to {to}")
        return response.json()
    except Exception as e:
        logger.error(f"Failed to send message: {e}")
        raise

print("✅ WhatsApp API functions defined")

def build_main_menu():
    """Build main menu interactive button message"""
    return {
        'type': 'button',
        'body': {
            'text': '👋 Welcome to RestroPulse!\n\nWhat would you like to do?'
        },
        'action': {
            'buttons': [
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.VIEW_PROFILE,
                        'title': '📋 View Profile'
                    }
                },
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.CHECK_STRATEGY,
                        'title': '📅 Check Strategy'
                    }
                },
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.VIEW_NEXT_POST,
                        'title': '🖼️ View Next Post'
                    }
                }
            ]
        }
    }

def build_business_profile(restaurant):
    """Build business profile message"""
    text = f"""🏪 Your Business Profile

Restaurant: {restaurant.get('business_name', 'N/A')}
Cuisine: {restaurant.get('cuisine_type', 'N/A')}
Contact: {restaurant.get('contact_number', 'N/A')}

📱 Instagram:
{restaurant.get('instagram_link', 'N/A')}

💼 Account Manager:
{restaurant.get('account_manager', {}).get('name', 'N/A')}
📞 {restaurant.get('account_manager', {}).get('contact_number', 'N/A')}

💳 Subscription: {restaurant.get('subscription', {}).get('plan', 'N/A')}
Status: {'✅ ' + restaurant.get('subscription', {}).get('status', 'N/A')}"""
    return text

def build_strategy_review(strategy):
    """Build strategy review message with approval buttons"""
    breakdown = strategy.get('post_breakdown', {})
    total_posts = sum(breakdown.values())
    
    text = f"""📅 Content Strategy
Cycle: {strategy.get('cycle_start_date', 'N/A')} - {strategy.get('cycle_end_date', 'N/A')}

📝 Summary:
{strategy.get('summary_text', 'N/A')}

📊 Planned Posts: {total_posts}
- Menu highlights: {breakdown.get('menu_highlights', 0)}
- Customer reviews: {breakdown.get('customer_reviews', 0)}
- Chef specials: {breakdown.get('chef_specials', 0)}
- Restaurant ambiance: {breakdown.get('restaurant_ambiance', 0)}

Status: ⏳ Pending Approval"""
    
    return {
        'type': 'button',
        'body': {'text': text},
        'action': {
            'buttons': [
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.STRATEGY_APPROVE,
                        'title': '✅ Approve'
                    }
                },
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.STRATEGY_FEEDBACK,
                        'title': '📝 Feedback'
                    }
                },
                {
                    'type': 'reply',
                    'reply': {
                        'id': ButtonAction.BACK_TO_MENU,
                        'title': '🏠 Back'
                    }
                }
            ]
        }
    }

print("✅ Message builders defined")

def process_idle_state(restaurant, message):
    """Handle messages when restaurant is in IDLE state"""
    # Send main menu
    menu = build_main_menu()
    send_whatsapp_message(
        to=restaurant['whatsapp_id'],
        message_type='interactive_button',
        content=menu
    )
    
    # Update state
    restaurants.update_one(
        {'_id': restaurant['_id']},
        {
            '$set': {
                'conversation_state': ConversationState.MENU_SELECTION,
                'last_interaction_at': datetime.now()
            }
        }
    )
    
    logger.info(f"Sent menu to {restaurant['whatsapp_id']}")

def process_menu_selection(restaurant, message):
    """Handle menu button clicks"""
    action = message.get('body')
    
    if action == ButtonAction.VIEW_PROFILE:
        # Send business profile
        profile_text = build_business_profile(restaurant)
        send_whatsapp_message(
            to=restaurant['whatsapp_id'],
            message_type='text',
            content=profile_text
        )
        
        # Back to IDLE
        restaurants.update_one(
            {'_id': restaurant['_id']},
            {'$set': {'conversation_state': ConversationState.IDLE}}
        )
        
    elif action == ButtonAction.CHECK_STRATEGY:
        # Find pending strategy
        strategy = strategies.find_one({
            'restaurant_id': restaurant['_id'],
            'status': 'Pending Approval'
        })
        
        if strategy:
            strategy_msg = build_strategy_review(strategy)
            send_whatsapp_message(
                to=restaurant['whatsapp_id'],
                message_type='interactive_button',
                content=strategy_msg
            )
            
            restaurants.update_one(
                {'_id': restaurant['_id']},
                {'$set': {'conversation_state': ConversationState.AWAITING_STRATEGY_REVIEW}}
            )
        else:
            send_whatsapp_message(
                to=restaurant['whatsapp_id'],
                message_type='text',
                content='No pending strategy found.'
            )
            restaurants.update_one(
                {'_id': restaurant['_id']},
                {'$set': {'conversation_state': ConversationState.IDLE}}
            )
    
    elif action == ButtonAction.CONTACT_MANAGER:
        # Create support request
        support_requests.insert_one({
            'restaurant_id': restaurant['_id'],
            'restaurant_whatsapp_id': restaurant['whatsapp_id'],
            'request_type': 'account_manager_contact',
            'status': 'Open',
            'created_at': datetime.now()
        })
        
        send_whatsapp_message(
            to=restaurant['whatsapp_id'],
            message_type='text',
            content='✅ Request received! Your account manager will contact you within 2 hours.'
        )
        
        restaurants.update_one(
            {'_id': restaurant['_id']},
            {'$set': {'conversation_state': ConversationState.IDLE}}
        )

def process_strategy_review(restaurant, message):
    """Handle strategy approval/feedback"""
    action = message.get('body')
    
    if action == ButtonAction.STRATEGY_APPROVE:
        # Approve strategy
        strategies.update_one(
            {
                'restaurant_id': restaurant['_id'],
                'status': 'Pending Approval'
            },
            {'$set': {'status': 'Approved', 'approved_at': datetime.now()}}
        )
        
        send_whatsapp_message(
            to=restaurant['whatsapp_id'],
            message_type='text',
            content='✅ Strategy approved! We\'ll start creating content based on this plan.'
        )
        
        restaurants.update_one(
            {'_id': restaurant['_id']},
            {'$set': {'conversation_state': ConversationState.IDLE}}
        )

print("✅ Message processors defined")

def process_messages():
    """Main message processing function"""
    # Find unprocessed messages
    messages = message_logs.find({'processed': False}).sort('timestamp', 1)
    
    for message in messages:
        try:
            # Get restaurant
            restaurant = restaurants.find_one({
                'whatsapp_id': message['restaurant_whatsapp_id']
            })
            
            if not restaurant:
                logger.warning(f"Restaurant not found: {message['restaurant_whatsapp_id']}")
                message_logs.update_one(
                    {'_id': message['_id']},
                    {'$set': {'processed': True, 'processing_error': 'Restaurant not found'}}
                )
                continue
            
            # Route based on conversation state
            state = restaurant.get('conversation_state', ConversationState.IDLE)
            
            if state == ConversationState.IDLE:
                process_idle_state(restaurant, message)
            elif state == ConversationState.MENU_SELECTION:
                process_menu_selection(restaurant, message)
            elif state == ConversationState.AWAITING_STRATEGY_REVIEW:
                process_strategy_review(restaurant, message)
            # Add more state handlers as needed
            
            # Mark as processed
            message_logs.update_one(
                {'_id': message['_id']},
                {
                    '$set': {
                        'processed': True,
                        'bot_response_sent': True
                    }
                }
            )
            
            logger.info(f"Processed message {message['_id']}")
            
        except Exception as e:
            logger.error(f"Error processing message {message['_id']}: {e}")
            message_logs.update_one(
                {'_id': message['_id']},
                {'$set': {'processed': True, 'processing_error': str(e)}}
            )

print("✅ Main processing loop defined")

# Single processing cycle (for testing)
print("Running single message processing cycle...")
process_messages()
print("✅ Processing complete")

# Continuous processing loop (uncomment to run)
# WARNING: This will run indefinitely. Stop with Kernel > Interrupt

# print(f"Starting bot with {CRON_INTERVAL}s polling interval...")
# print("Press Kernel > Interrupt to stop")

# try:
#     while True:
#         process_messages()
#         time.sleep(CRON_INTERVAL)
# except KeyboardInterrupt:
#     print("\n✅ Bot stopped")
# finally:
#     client.close()
#     print("✅ MongoDB connection closed")

# Check unprocessed message count
unprocessed_count = message_logs.count_documents({'processed': False})
print(f"Unprocessed messages: {unprocessed_count}")

# View recent messages
recent_messages = list(message_logs.find().sort('timestamp', -1).limit(5))
for msg in recent_messages:
    print(f"\nFrom: {msg['restaurant_whatsapp_id']}")
    print(f"Type: {msg['message_type']}")
    print(f"Body: {msg.get('body', 'N/A')}")
    print(f"Processed: {msg['processed']}")
    print(f"Time: {msg['timestamp']}")

# Check restaurant conversation states
restaurant_states = list(restaurants.find({}, {
    'business_name': 1,
    'whatsapp_id': 1,
    'conversation_state': 1,
    'last_interaction_at': 1
}))

for rest in restaurant_states:
    print(f"\n{rest.get('business_name', 'N/A')}")
    print(f"  State: {rest.get('conversation_state', 'N/A')}")
    print(f"  Last interaction: {rest.get('last_interaction_at', 'N/A')}")
