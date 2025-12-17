// Follow this setup guide to integrate the Deno runtime into your application:
// https://docs.supabase.com/guides/functions/quickstart

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

serve(async (req) => {
  const { record, type, table, schema } = await req.json();

  // Create Supabase Client (Service Role)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  let targetUserId = "";
  let title = "";
  let body = "";
  let data = {};

  // LOGIC: Determine who to notify based on the table event
  if (table === "messages") {
    // New Message
    // Need to find who the receiver is. 
    // Messages table has: id, conversation_id, sender_id, content
    
    // We need to fetch the conversation (interests table) to find the OTHER user.
    const { data: conversation } = await supabase
      .from("interests")
      .select("sender_id, receiver_id")
      .eq("id", record.conversation_id)
      .single();

    if (conversation) {
      targetUserId = conversation.sender_id === record.sender_id 
        ? conversation.receiver_id 
        : conversation.sender_id;
      
      title = "New Message";
      body = record.content; // "Hey, how are you?"
      data = { url: `/chat/${record.conversation_id}` };
    }

  } else if (table === "interests") {
    // New Interest (Connection Request)
    if (record.status === "pending") {
      targetUserId = record.receiver_id;
      title = "New Connection Request";
      body = "Someone wants to connect with you!";
      data = { url: "/(tabs)/interests" };
    } 
    // Interest Accepted
    else if (record.status === "accepted") {
      // Notify the SENDER that their request was accepted
      // (Wait, 'record' is the new state. If status changed to accepted, notify sender)
      targetUserId = record.sender_id;
      title = "Connection Accepted!";
      body = "You can now chat.";
      data = { url: `/chat/${record.id}` };
    }
  }

  if (!targetUserId) {
    return new Response(JSON.stringify({ message: "No target user found" }), { status: 200 });
  }

  // Fetch Target User's Push Token
  const { data: profile } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .eq("id", targetUserId)
    .single();

  if (!profile || !profile.expo_push_token) {
    return new Response(JSON.stringify({ message: "User has no push token" }), { status: 200 });
  }

  // Send to Expo
  const message = {
    to: profile.expo_push_token,
    sound: "default",
    title: title,
    body: body,
    data: data,
  };

  const response = await fetch(EXPO_PUSH_API, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  return new Response(JSON.stringify({ success: true, expo: await response.json() }), {
    headers: { "Content-Type": "application/json" },
  });
});

