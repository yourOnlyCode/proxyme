# Content Moderation API Pricing Comparison

## Free Tier Comparison

| Service | Free Tier | Paid After Free Tier | Best For |
|---------|-----------|---------------------|----------|
| **API4AI** | 1,000 requests/month | ~$0.50-1.00 per 1,000 (via RapidAPI) | **Most Affordable** ✅ |
| **Google Cloud Vision** | 1,000 requests/month | $1.50 per 1,000 requests | Most Reliable |
| **AWS Rekognition** | 5,000/month (3 months), then 1,000/month | $1.00 per 1,000 images | AWS Users |
| **Sightengine** | 2,000 operations/month | $2.90 per 1,000 operations | Higher Free Tier |
| **ModerateAPI** | 1,000 requests/month | $1.90 per 1,000 requests | Simple Integration |
| **OpenModerator** | 1,000 requests/month | $2.00 per 1,000 requests | Multiple Features |

## Recommendation: API4AI

**API4AI is the most affordable option** with:
- ✅ Same free tier as Google Cloud Vision (1,000/month)
- ✅ **Lower paid pricing** (~$0.50-1.00 per 1,000 vs $1.50 for Google)
- ✅ Simple API integration
- ✅ Good accuracy for NSFW detection
- ✅ Available via RapidAPI (easy setup)

## Cost Analysis (10,000 images/month)

- **API4AI**: **~$4.50-9.00/month** (9,000 paid × $0.50-1.00/1,000) ⭐ **CHEAPEST**
- **AWS Rekognition**: $9.00/month (9,000 paid × $1.00/1,000)
- **Google Cloud Vision**: $13.50/month (9,000 paid × $1.50/1,000)
- **Sightengine**: $26.10/month (8,000 paid × $2.90/1,000)

**Winner: API4AI** - Up to 3x cheaper than Google Cloud Vision!

## Setup for API4AI

1. Sign up at [RapidAPI](https://rapidapi.com/api4ai/api/api4ai-nsfw) or [API4AI directly](https://api4ai.cloud)
2. Get your API key
3. Set secret: `supabase secrets set API4AI_API_KEY=your_key_here` or `RAPIDAPI_KEY=your_key_here`
4. Deploy the function (use `index-api4ai.ts` as reference)

## Implementation

To switch to API4AI, update `supabase/functions/moderate-content/index.ts`:

```typescript
// Replace Google Cloud Vision API call with API4AI
const API4AI_URL = "https://api4ai.cloud/api/v1/nsfw";

const response = await fetch(API4AI_URL, {
  method: "POST",
  headers: {
    "X-RapidAPI-Key": Deno.env.get("API4AI_API_KEY") ?? "",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    image: base64Image,
  }),
});
```

