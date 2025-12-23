# Content Moderation Edge Function

This function automatically detects inappropriate content in images, blocks the content from being posted, and reports the user.

## Features

- ✅ **Automatic Detection**: Uses API4AI or Google Cloud Vision API to detect inappropriate content
- ✅ **Blocks Content**: Prevents inappropriate images from being uploaded
- ✅ **Auto-Reports Users**: Automatically creates a report when inappropriate content is detected
- ✅ **Free Tier Available**: 1,000 free requests/month (both APIs)
- ✅ **Cost-Effective**: API4AI is up to 3x cheaper than Google Cloud Vision
- ✅ **Dual API Support**: Switch between APIs via environment variable

## Setup

### Option 1: API4AI (Recommended - More Affordable) ⭐

**Free Tier**: 1,000 requests/month  
**Paid**: ~$0.50-1.00 per 1,000 requests (vs $1.50 for Google)  
**Savings**: Up to 3x cheaper than Google Cloud Vision!

1. Sign up at [RapidAPI](https://rapidapi.com/api4ai/api/api4ai-nsfw) or [API4AI directly](https://api4ai.cloud)
2. Get your API key (RapidAPI key works)
3. Set environment variables:
   ```bash
   supabase secrets set USE_API4AI=true
   supabase secrets set API4AI_API_KEY=your_rapidapi_key_here
   # OR use RAPIDAPI_KEY
   supabase secrets set RAPIDAPI_KEY=your_rapidapi_key_here
   ```

### Option 2: Google Cloud Vision API

**Free Tier**: 1,000 requests/month  
**Paid**: $1.50 per 1,000 requests

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable "Cloud Vision API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. (Optional) Restrict the API key to "Cloud Vision API" for security
6. Copy the API key
7. Set environment variables:
   ```bash
   supabase secrets set USE_API4AI=false
   supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=your_api_key_here
   ```

### 3. Deploy the Function

```bash
supabase functions deploy moderate-content
```

## Usage

The function accepts either:
- `base64Image`: Base64-encoded image (recommended for pre-upload checks)
- `imageUrl`: URL to an already uploaded image

```typescript
// Pre-upload check (recommended)
const { data, error } = await supabase.functions.invoke('moderate-content', {
  body: {
    base64Image: base64String, // From FileSystem.readAsStringAsync
    userId: user.id,
    contentType: 'status_image'
  }
});

if (data?.blocked) {
  // Content was blocked - don't allow upload
  Alert.alert('Content Blocked', data.message || 'Your image violates community guidelines');
  return; // Stop upload
} else if (data?.safe) {
  // Content is safe - proceed with upload
  // ... continue with upload logic
}
```

## What Happens When Content is Blocked

1. **Upload is prevented** - The function returns `blocked: true`
2. **User is auto-reported** - A report is created in the `reports` table with:
   - `reporter_id`: The user's ID (indicates system auto-detection)
   - `reported_id`: The user's ID
   - `reason`: "[AUTO-MODERATED] Inappropriate content detected..." with details
   - `status`: "pending" (for admin review)
3. **User sees error message** - Friendly message explaining why content was blocked

## Detection Criteria

**Google Cloud Vision**: Content is blocked if any of these are `LIKELY` or `VERY_LIKELY`:
- **Adult**: Explicit sexual content
- **Violence**: Violent or graphic content
- **Racy**: Suggestive or racy content (bikinis, lingerie, etc.)

**API4AI**: Content is blocked if NSFW score ≥ 50% (configurable threshold)

## Cost Comparison

| Service | Free Tier | Paid (per 1,000) | Best For |
|---------|-----------|-----------------|----------|
| **API4AI** ⭐ | 1,000/month | **~$0.50-1.00** | **Most Affordable** |
| **Google Cloud Vision** | 1,000/month | $1.50 | Most Reliable |
| **AWS Rekognition** | 5,000/month (3mo), then 1,000/month | $1.00 | AWS Users |

**Example (10,000 images/month):**
- API4AI: **~$4.50-9.00/month** ⭐
- AWS Rekognition: $9.00/month
- Google Cloud Vision: $13.50/month

## Integration

Already integrated into:
- ✅ **Status Upload** (`components/StatusProvider.tsx`): Checks images before uploading

To add to other uploads:
- Profile photo uploads
- Chat image uploads
- Any other image upload flows

## Viewing Auto-Reports

In Supabase Dashboard:
1. Go to `reports` table
2. Filter by `reason` containing `[AUTO-MODERATED]`
3. Review and take action on flagged users

