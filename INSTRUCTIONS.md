# Deployment & Setup Guide

## 1. Deploy Supabase Edge Function (Push Notifications)

You need to deploy the backend code that sends notifications.

1.  **Use npx (Recommended)**:
    You don't need to install it globally. Just use `npx` prefix for all commands.
    ```bash
    npx supabase login
    ```
    (This will open your browser. Generate a token and paste it back.)
3.  **Link your Project**:
    Go to your Supabase Dashboard, get your **Project ID** (Reference ID) from Settings > General.
    ```bash
    npx supabase link --project-ref your-project-id
    ```
4.  **Deploy the Function**:
    ```bash
    npx supabase functions deploy push-notification
    ```
    *   Note the **Function URL** output at the end (e.g., `https://xyz.supabase.co/functions/v1/push-notification`).

## 2. Set Up Database Webhook

Now tell the database to trigger that function when messages send.

1.  Go to **Supabase Dashboard** -> **Integrations** -> **Webhooks**.
2.  Click **"Enable"** (if not already) or **"New Webhook"**.
3.  **Name**: `push-trigger`
4.  **Table**: `messages`
5.  **Events**: `INSERT`
6.  **Type**: `HTTP Request`
7.  **URL**: Paste your **Function URL** from Step 1.
8.  **Method**: `POST`
9.  **HTTP Headers**:
    *   `Content-Type`: `application/json`
    *   `Authorization`: `Bearer YOUR_SUPABASE_ANON_KEY` (Get this from Settings > API)
10. Click **Confirm**.

*Repeat this for the `interests` table if you want notifications for connection requests.*

## 3. RevenueCat Setup (Payments)

1.  **Create Account**: Go to [RevenueCat](https://www.revenuecat.com/) and sign up.
2.  **Create Project**: Name it "Proxy".
3.  **Add Apps**:
    *   Select **iOS** (App Store) -> Bundle ID (from `app.json`, e.g., `com.anonymous.proxybusiness`).
    *   Select **Android** (Play Store) -> Package Name.
4.  **Get API Keys**:
    *   Copy the **Public SDK Key** for Apple and Google.
    *   Paste them into your `.env` file or `lib/purchases.ts`.
5.  **Create Entitlement**:
    *   Go to **Entitlements** in RevenueCat sidebar.
    *   Create a new one called: `verified` (Exact spelling matters!).
6.  **Create Offering**:
    *   Go to **Offerings**.
    *   Create one called `Default`.
    *   Add a **Package** (e.g., "Monthly").
    *   Attach an App Store/Play Store product ID (you'll need to create these in Apple App Connect / Google Play Console first, e.g., `proxy_verified_monthly`).

## 4. Final SQL Scripts

Ensure you run these in Supabase SQL Editor:
*   `supabase/add_push_token.sql`
*   `supabase/add_verification.sql`

