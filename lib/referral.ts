/**
 * Centralized referral sharing content generator
 * Used across all referral share buttons in the app
 */
export function getReferralShareContent(friendCode: string | null) {
  if (!friendCode) return null;
  
  // Proxyme app link - update with your actual app store links
  const appStoreLink = 'https://proxyme.app'; // Replace with actual app store link
  const appStoreLinkPlaceholder = 'www.proxyme.app'; // Placeholder link for messaging
  const deepLink = `proxybusiness://referral?code=${friendCode}`; // Deep link using app scheme
  
  // Messaging-specific text with paragraph break and app store link
  const messagingText = `Find me and new friends on Proxyme! The proximity based app for connecting through common interests.\n\nRegister with my friend code: ${friendCode} to get closer to verification!\n\n${appStoreLink}`;
  
  return {
    friendCode,
    appStoreLink,
    appStoreLinkPlaceholder,
    deepLink,
    shareText: `Join me on Proxyme! Use my friend code ${friendCode} to unlock verification when you sign up.\n\nDownload: ${appStoreLink}\n\nOr open in app: ${deepLink}`,
    messagingText,
  };
}
