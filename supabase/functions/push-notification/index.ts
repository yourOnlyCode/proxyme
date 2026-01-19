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
      data = { url: "/requests" };
    } 
    // Interest Accepted
    else if (record.status === "accepted") {
      // Notify the SENDER that their request was accepted
      targetUserId = record.sender_id;
      title = "Connection Accepted!";
      body = "You can now chat.";
      data = { url: `/chat/${record.id}` };
    }
  } else if (table === "notifications") {
    // All notifications (club, event, connection, etc.)
    targetUserId = record.user_id;
    title = record.title;
    body = record.body;
    
    // Build URL based on notification type
    if (record.type === "connection_accepted" && record.data?.partner_id) {
      // Route to the accepted conversation (interests.id), not the partner user id.
      const me = record.user_id;
      const partner = record.data.partner_id;
      const { data: convo } = await supabase
        .from("interests")
        .select("id")
        .eq("status", "accepted")
        .or(`and(sender_id.eq.${me},receiver_id.eq.${partner}),and(sender_id.eq.${partner},receiver_id.eq.${me})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (convo?.id) {
        data = { url: `/chat/${convo.id}` };
      } else {
        data = { url: "/(tabs)/inbox" };
      }
    } else
    if (record.type === "forum_reply" && record.data?.club_id && record.data?.topic_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=forum&topic=${record.data.topic_id}` };
    } else if (record.type === "city_milestone") {
      // Community growth milestone (send to City tab)
      data = { url: "/(tabs)/feed" };
    } else if (record.type === "club_event" && record.data?.club_id && record.data?.event_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events` };
    } else if (record.type === "club_member" && record.data?.club_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=members` };
    } else if (record.type === "event_rsvp" && record.data?.club_id && record.data?.event_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events&event=${record.data.event_id}` };
    } else if (record.type === "event_rsvp_update" && record.data?.club_id && record.data?.event_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events&event=${record.data.event_id}` };
    } else if (record.type === "event_update" && record.data?.club_id && record.data?.event_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events&event=${record.data.event_id}` };
    } else if (record.type === "event_reminder" && record.data?.club_id && record.data?.event_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events&event=${record.data.event_id}` };
    } else if (record.type === "event_cancelled" && record.data?.club_id) {
      data = { url: `/clubs/${record.data.club_id}?tab=events` };
    } else {
      data = { url: "/requests" };
    }
  } else if (table === "club_forum_replies") {
    // Forum reply - notification will be created by trigger, but we can also send push
    const { data: topic } = await supabase
      .from("club_forum_topics")
      .select("created_by, title, club_id")
      .eq("id", record.topic_id)
      .single();
    
    if (topic && topic.created_by !== record.created_by) {
      targetUserId = topic.created_by;
      const { data: replier } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", record.created_by)
        .single();
      
      title = "New Reply to Your Post";
      body = `${replier?.username || "Someone"} replied to "${topic.title}"`;
      data = { url: `/clubs/${topic.club_id}?tab=forum&topic=${record.topic_id}` };
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

