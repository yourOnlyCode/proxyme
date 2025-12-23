// Content Moderation Edge Function - API4AI Version
// Automatically detects inappropriate images, blocks content, and reports users
// Uses API4AI NSFW Detection (Free tier: 1,000 requests/month, more affordable paid tier)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// API4AI NSFW Detection API (via RapidAPI or direct)
const API4AI_NSFW_API = "https://api4ai.cloud/api/v1/nsfw";

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

    // Get API4AI API Key (can be RapidAPI key or direct API key)
    const apiKey = Deno.env.get("API4AI_API_KEY");
    
    if (!apiKey) {
      console.error("API4AI_API_KEY not set - skipping moderation");
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

    // Call API4AI NSFW Detection API
    // Option 1: Direct API (if available)
    // Option 2: Via RapidAPI (more common)
    const rapidApiKey = Deno.env.get("RAPIDAPI_KEY");
    
    let api4aiResponse;
    if (rapidApiKey) {
      // Use RapidAPI endpoint
      api4aiResponse = await fetch("https://api4ai-nsfw.p.rapidapi.com/v1/results", {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": rapidApiKey,
          "X-RapidAPI-Host": "api4ai-nsfw.p.rapidapi.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
        }),
      });
    } else {
      // Try direct API4AI endpoint
      api4aiResponse = await fetch(API4AI_NSFW_API, {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: imageBase64,
        }),
      });
    }

    if (!api4aiResponse.ok) {
      const errorData = await api4aiResponse.text();
      console.error("API4AI Error:", errorData);
      return new Response(
        JSON.stringify({ error: "Moderation check failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const api4aiData = await api4aiResponse.json();

    // API4AI typically returns a confidence score (0-1) for NSFW content
    // Higher score = more likely to be inappropriate
    // Threshold: 0.5 (50% confidence) or adjust based on your needs
    const nsfwScore = api4aiData.results?.[0]?.entities?.[0]?.classes?.nsfw || 
                     api4aiData.nsfw_score || 
                     api4aiData.confidence ||
                     0;

    const NSFW_THRESHOLD = 0.5; // Adjust this threshold (0.0 to 1.0)
    const isInappropriate = nsfwScore >= NSFW_THRESHOLD;

    if (isInappropriate) {
      // Auto-report the user for posting inappropriate content
      const reportReason = `[AUTO-MODERATED] Inappropriate ${contentType} detected. ` +
        `NSFW Score: ${(nsfwScore * 100).toFixed(1)}%`;

      const { error: reportError } = await supabaseAdmin.from("reports").insert({
        reporter_id: userId, // System auto-report
        reported_id: userId,
        reason: reportReason,
        status: "pending",
      });

      if (reportError) {
        console.error("Failed to create auto-report:", reportError);
      } else {
        console.log(`Auto-report created for user ${userId} due to inappropriate content`);
      }

      return new Response(
        JSON.stringify({
          safe: false,
          blocked: true,
          reason: "Content violates community guidelines",
          message: "Your image contains inappropriate content and cannot be posted.",
          details: {
            nsfwScore: nsfwScore,
            threshold: NSFW_THRESHOLD,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Content is safe
    return new Response(
      JSON.stringify({
        safe: true,
        blocked: false,
        details: {
          nsfwScore: nsfwScore,
        },
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

