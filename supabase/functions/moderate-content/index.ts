// Content Moderation Edge Function
// Automatically detects inappropriate images, blocks content, and reports users
// Supports both Google Cloud Vision API and API4AI (switch via USE_API4AI env var)
// Google Cloud Vision: Free tier 1,000/month, then $1.50/1,000
// API4AI: Free tier 1,000/month, then ~$0.50-1.00/1,000 (MORE AFFORDABLE)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_CLOUD_VISION_API = "https://vision.googleapis.com/v1/images:annotate";
// API4AI NSFW Detection via RapidAPI
const API4AI_NSFW_API = "https://api4ai-nsfw.p.rapidapi.com/v1/results";

serve(async (req) => {
  try {
    // Accept either imageUrl (for already uploaded images) or base64Image (for pre-upload check)
    const { imageUrl, base64Image, userId, contentType = "status_image" } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!imageUrl && !base64Image) {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl or base64Image" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check which API to use (API4AI is more affordable)
    const useApi4ai = Deno.env.get("USE_API4AI") === "true";
    const googleApiKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
    const api4aiKey = Deno.env.get("API4AI_API_KEY") || Deno.env.get("RAPIDAPI_KEY");
    
    if (useApi4ai && !api4aiKey) {
      console.error("API4AI_API_KEY or RAPIDAPI_KEY not set - skipping moderation");
      return new Response(
        JSON.stringify({ 
          safe: true, 
          warning: "Moderation API key not configured - content allowed" 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (!useApi4ai && !googleApiKey) {
      console.error("GOOGLE_CLOUD_VISION_API_KEY not set - skipping moderation");
      return new Response(
        JSON.stringify({ 
          safe: true, 
          warning: "Moderation API key not configured - content allowed" 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get base64 image - either from parameter or download from URL
    let imageBase64: string;
    if (base64Image) {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
      imageBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
    } else if (imageUrl) {
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }
        const imageBuffer = await imageResponse.arrayBuffer();
        imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      } catch (error) {
        console.error("Error downloading image:", error);
        return new Response(
          JSON.stringify({ error: "Failed to process image" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let isInappropriate = false;
    let moderationDetails: any = {};

    if (useApi4ai) {
      // Use API4AI (More Affordable)
      // API4AI accepts base64 image directly or via multipart form
      const api4aiResponse = await fetch(API4AI_NSFW_API, {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": api4aiKey!,
          "X-RapidAPI-Host": "api4ai-nsfw.p.rapidapi.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
          // Alternative format if needed:
          // url: imageUrl, // if using URL instead of base64
        }),
      });

      if (!api4aiResponse.ok) {
        const errorData = await api4aiResponse.text();
        console.error("API4AI Error:", errorData);
        return new Response(
          JSON.stringify({ error: "Moderation check failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const api4aiData = await api4aiResponse.json();
      
      // API4AI response format varies - try multiple possible paths
      // Format 1: results[0].entities[0].classes.nsfw
      // Format 2: Direct nsfw_score or confidence field
      let nsfwScore = 0;
      
      if (api4aiData.results && api4aiData.results[0]) {
        const result = api4aiData.results[0];
        if (result.entities && result.entities[0] && result.entities[0].classes) {
          // Get NSFW class score (0-1)
          nsfwScore = result.entities[0].classes.nsfw || 0;
        } else if (result.status === 'success' && result.results && result.results[0]) {
          // Alternative nested structure
          nsfwScore = result.results[0].entities?.[0]?.classes?.nsfw || 0;
        }
      }
      
      // Fallback to direct fields
      if (nsfwScore === 0) {
        nsfwScore = api4aiData.nsfw_score || 
                   api4aiData.confidence || 
                   api4aiData.score ||
                   0;
      }

      const NSFW_THRESHOLD = 0.5; // 50% confidence threshold (adjust as needed)
      isInappropriate = nsfwScore >= NSFW_THRESHOLD;
      moderationDetails = { nsfwScore, threshold: NSFW_THRESHOLD, provider: "API4AI" };
    } else {
      // Use Google Cloud Vision API
      const visionResponse = await fetch(
        `${GOOGLE_CLOUD_VISION_API}?key=${googleApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: imageBase64 },
                features: [
                  { type: "SAFE_SEARCH_DETECTION", maxResults: 1 },
                ],
              },
            ],
          }),
        }
      );

      if (!visionResponse.ok) {
        const errorData = await visionResponse.text();
        console.error("Vision API Error:", errorData);
        return new Response(
          JSON.stringify({ error: "Moderation check failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const visionData = await visionResponse.json();

      if (visionData.error) {
        console.error("Vision API Error:", visionData.error);
        return new Response(
          JSON.stringify({ error: "Moderation check failed", details: visionData.error }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const safeSearchAnnotation = visionData.responses?.[0]?.safeSearchAnnotation;

      if (!safeSearchAnnotation) {
        console.error("No safe search annotation returned");
        return new Response(
          JSON.stringify({ error: "Invalid response from moderation API" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check for inappropriate content
      // Block if content is LIKELY or VERY_LIKELY to be inappropriate
      isInappropriate =
        safeSearchAnnotation.adult === "VERY_LIKELY" ||
        safeSearchAnnotation.adult === "LIKELY" ||
        safeSearchAnnotation.violence === "VERY_LIKELY" ||
        safeSearchAnnotation.violence === "LIKELY" ||
        safeSearchAnnotation.racy === "VERY_LIKELY" ||
        safeSearchAnnotation.racy === "LIKELY";
      
      moderationDetails = {
        adult: safeSearchAnnotation.adult,
        violence: safeSearchAnnotation.violence,
        racy: safeSearchAnnotation.racy,
        provider: "Google Cloud Vision"
      };
    }

    if (isInappropriate) {
      // Auto-report the user for posting inappropriate content
      const reportReason = `[AUTO-MODERATED] Inappropriate ${contentType} detected. ` +
        (useApi4ai 
          ? `NSFW Score: ${(moderationDetails.nsfwScore * 100).toFixed(1)}%`
          : `Adult: ${moderationDetails.adult}, Violence: ${moderationDetails.violence}, Racy: ${moderationDetails.racy}`
        );

      // Create auto-report - use the user's own ID as reporter to indicate system detection
      // Admins can filter by reason starting with "[AUTO-MODERATED]" to identify auto-reports
      const { error: reportError } = await supabaseAdmin.from("reports").insert({
        reporter_id: userId, // System auto-report (flagged by content moderation)
        reported_id: userId,
        reason: reportReason,
        status: "pending",
      });

      if (reportError) {
        console.error("Failed to create auto-report:", reportError);
      } else {
        console.log(`Auto-report created for user ${userId} due to inappropriate content`);
      }

      // Log the moderation event
      console.log(`Content blocked for user ${userId}:`, moderationDetails);

      return new Response(
        JSON.stringify({
          safe: false,
          blocked: true,
          reason: "Content violates community guidelines",
          message: "Your image contains inappropriate content and cannot be posted.",
          details: moderationDetails,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Content is safe
    return new Response(
      JSON.stringify({
        safe: true,
        blocked: false,
        details: moderationDetails,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Moderation error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

