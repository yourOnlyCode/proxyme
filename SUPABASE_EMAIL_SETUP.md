# Supabase Email Verification Setup

## Problem
When users verify their email, Supabase redirects to a localhost URL which shows "this site can't be reached" on mobile devices.

## Solution
Configure Supabase to redirect to `https://www.proxyme.app` after email verification.

## Steps to Configure

### 1. Update Supabase Auth Settings

1. Go to your **Supabase Dashboard**
2. Navigate to **Authentication** → **URL Configuration**
3. Add the following to **Redirect URLs**:
   ```
   https://www.proxyme.app
   https://www.proxyme.app/*
   proxybusiness://
   ```

### 2. Configure Site URL

1. In the same **URL Configuration** section
2. Set **Site URL** to:
   ```
   https://www.proxyme.app
   ```

### 3. Email Template Configuration

1. Go to **Authentication** → **Email Templates**
2. Select **Confirm signup** template
3. Update the confirmation link to use the correct redirect:
   ```html
   <a href="{{ .ConfirmationURL }}">Confirm your email</a>
   ```
   
   The `{{ .ConfirmationURL }}` will automatically use the `emailRedirectTo` parameter we set in the code.

### 4. Create Landing Page

You need to create a simple landing page at `https://www.proxyme.app` that:
- Thanks the user for verifying their email
- Provides a button/link to open the app: `proxybusiness://`
- Provides app store links if the app isn't installed

Example HTML structure:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Email Verified - Proxyme</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    <h1>Email Verified!</h1>
    <p>Your email has been successfully verified.</p>
    <a href="proxybusiness://">Open Proxyme App</a>
    <p>Don't have the app? Download it:</p>
    <a href="https://apps.apple.com/app/proxyme">iOS App Store</a>
    <a href="https://play.google.com/store/apps/details?id=com.proxy-social.app">Google Play</a>
</body>
</html>
```

## How Email Verification Works

1. User signs up with email/password
2. Supabase sends verification email with a link
3. User clicks the link in their email
4. Supabase verifies the email and redirects to `https://www.proxyme.app`
5. The landing page shows confirmation and provides a deep link to open the app
6. If on mobile, the deep link (`proxybusiness://`) opens the app
7. The app's auth listener detects the verified session and logs the user in

## Testing

1. Sign up with a real email address
2. Check your inbox for the verification email
3. Click the verification link
4. Verify you're redirected to `https://www.proxyme.app`
5. Test the deep link to ensure it opens the app

## Notes

- The `emailRedirectTo` parameter is now set in `app/(auth)/sign-up.tsx`
- Make sure your domain is verified and accessible
- Deep linking requires the app to be installed on the device
- Consider adding a fallback to app store links if the app isn't installed
