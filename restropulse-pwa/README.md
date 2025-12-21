# RestroPulse - Mobile PWA

**RestroPulse** is a mobile-first Progressive Web Application (PWA) designed for restaurant owners and managers. It provides an AI-powered framework for social media content creation, approval, engagement, and strategic planning.

## Technology Stack

*   **Frontend Framework:** React 19 (TypeScript)
*   **Styling:** Tailwind CSS
*   **Icons:** Lucide React
*   **Charts:** Recharts
*   **Routing:** Custom State-based Routing (SPA/PWA optimized)
*   **Build Tool:** Vite (Implicit)

---

## Functional Requirements

The following is an exhaustive list of features and behaviors implemented in the application.

### 1. Authentication & Onboarding
*   **Login Methods:**
    *   The system allows users to login using **WhatsApp** or **Instagram** (simulated Oauth).
*   **Session Management:**
    *   The system persists user sessions via local storage to keep users logged in upon returning to the app.
    *   The system handles browser back-button navigation to prevent returning to the login screen once authenticated.

### 2. Dashboard
*   **User Personalization:** Displays the user's name and a welcome message.
*   **Notifications:**
    *   Displays a notification badge on the bell icon indicating the count of posts requiring attention.
*   **Action Items:**
    *   **Pending Reviews Banner:** Visible only when posts are in `PENDING_APPROVAL` or `CHANGES_REQUESTED` status. Shows count and navigates to the *Content Studio*.
*   **Schedule Preview:**
    *   **Up Next Card:** Displays the next scheduled post with its thumbnail, platform, date, and status.
    *   Handles empty states if no posts are scheduled.
*   **Live Context Snapshot:**
    *   Displays currently active "Offers" and "Chef's Specials" visible on the restaurant's profile.
    *   Provides a quick link to the *Inputs* section to edit these.
*   **Analytics:**
    *   **Engagement Pulse:** An area chart visualizing engagement trends over the last 5 weeks.
    *   **Advanced Insights:** Placeholders for "Reach" and "Engagement" metrics (marked as Coming Soon/Locked).

### 3. Content Studio (Core Feature)
The Content Studio is the central hub for managing social media posts.

#### 3.1. Navigation & Views
*   **Tabs:** Users can switch between `Review` (Pending), `Scheduled` (Queue), and `History` (Past posts).
*   **Empty States:** Displays context-aware illustrations and messages when lists are empty.

#### 3.2. Post Display (Post Card)
*   **Media Rendering:**
    *   **Images:** Displays high-quality thumbnails.
    *   **Videos/Reels:** Supports inline playback with Play/Pause toggles and tap-to-play functionality.
    *   **Carousels:** Supports horizontal swiping between images with dot indicators and slide counters.
*   **Metadata:** Displays Platform (Instagram/Facebook), Post Type (Reel, Story, Carousel), Date, Time, and Caption.
*   **Status Indicators:**
    *   Visual badges for `Missed Deadline`, `Changes Requested`, `Locked`, and `Published`.

#### 3.3. Review Workflow
*   **Approve:** Users can approve a pending post, moving it to the `Scheduled` tab.
*   **Request Edit:** Users can open a feedback interface to request changes.
*   **Revision Status:** If changes are already requested, the card shows a "Revision in progress" state.

#### 3.4. Feedback System (Refine Content)
*   **Interaction:** A swipeable bottom sheet modal.
*   **Categories:** Feedback is categorized into `Caption`, `Media`, `Timing`, and `Other` via horizontal tabs.
*   **Quick Options (Chips):** Users can select pre-defined issues (e.g., "Too long", "Wrong tone", "Blurry") to save typing time.
*   **General Notes:** A text area for providing specific context.
*   **History Tracking:**
    *   Displays previous feedback rounds.
    *   Displays the resolution provided by the AI/Team for previous feedback.
*   **Revision Limits:**
    *   The system tracks the number of feedback rounds.
    *   **Max Limit:** Upon reaching 2 rounds of feedback, the system locks the feedback form and prompts the user to contact their Account Manager via WhatsApp.

#### 3.5. Scheduled Workflow
*   **Locking Mechanism:** Posts scheduled within **3 hours** of the publication time are "Locked" and cannot be reverted/edited.
*   **Revert:** Users can revert a non-locked scheduled post back to the `Review` tab to request further edits.

### 4. Inputs (Context Updates)
This section allows users to provide raw data to the AI engine.

*   **Action Cards:**
    *   **Upcoming Offers:** Manage discounts/promos.
    *   **Chef's Specials:** Highlight specific dishes.
    *   **Update Menu:** Upload new menu files.
    *   **Captured Moments:** (Placeholder) Upload raw media.
*   **Constraints:**
    *   **Max Limits:** Users can only have **3 active offers** and **3 active specials** at a time. The system prevents adding more until existing ones are deleted.
*   **Input Modals (Bottom Sheets):**
    *   **Add Offer:** Captures Title, Valid Until Date, and Details.
    *   **Add Special:** Captures Dish Name and Description.
    *   **Menu Upload:** Simulates a file upload interface for PDF/Images.
*   **Active Context List:**
    *   Displays currently active inputs.
    *   Allows deletion of specific offers or specials.
    *   Shows the "Last Updated" date for the menu.

### 5. Content Strategy
*   **Cycle Management:** Displays strategy cycles (e.g., May 1 - May 15).
*   **Cycle States:** `Active`, `Pending Approval`, `Approved`.
*   **Strategy Details:**
    *   Executive Summary.
    *   **Content Mix:** Visual progress bars showing the distribution of post categories (e.g., 4 Menu posts, 2 BTS posts).
*   **Approval Workflow:**
    *   **Approve:** Users can approve a proposed strategy.
    *   **Request Changes:** Users can open a feedback modal to select areas for improvement (Frequency, Topics, etc.) and add notes.
*   **Feedback Display:** If changes were requested, the card displays the user's previous notes.

### 6. Settings & Profile
*   **Profile Management:**
    *   View Restaurant Name, Cuisine, and Location.
    *   **Edit Profile:** Modal to update restaurant details.
*   **Integrations:**
    *   **Instagram:** Toggle to Connect/Disconnect.
    *   **Facebook:** Displayed as "Coming Soon" (Disabled).
*   **Team:**
    *   Displays Account Manager details (Name, Photo).
    *   **Direct Support:** WhatsApp button to chat directly with the Account Manager.
*   **Subscription Management:**
    *   **View Plan:** Shows current tier (Basic/Gold/Platinum), Price, and Renewal Date.
    *   **Change Plan:** Modal to compare features across tiers and switch plans.
*   **Account Actions:**
    *   Logout.
    *   Delete Account.

### 7. Global UI/UX Behaviors
*   **Mobile-First Navigation:**
    *   Sticky bottom navigation bar.
    *   Swipe-down gestures to close bottom sheets/modals.
    *   No visible scrollbars (clean aesthetic).
*   **History & Routing:**
    *   Modals push state to the browser history (`window.history.pushState`).
    *   Hardware back button on Android or Swipe-back on iOS closes modals/overlays instead of exiting the app.
*   **Touch Interactions:**
    *   Active states (`active:scale`) on buttons for tactile feedback.
    *   Large touch targets for all interactive elements.

## Future Enhancements (Backend Roadmap)
*   **Node.js & Express:** API development.
*   **MongoDB:** Database for storing Users, Restaurants, Posts, and Strategy Cycles.
*   **Azure Blob Storage:** For storing media assets (images/videos) and menu files.
*   **RazorPay Integration:** For handling subscription payments.
