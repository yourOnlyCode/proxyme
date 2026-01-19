import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return json(500, { error: "Missing server env" });

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    if (!token) return json(401, { error: "Missing bearer token" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Validate token → get user id
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) return json(401, { error: "Invalid token" });
    const userId = userData.user.id;

    // Delete profile row first (cascades to dependent rows via FK deletes)
    const { error: profileErr } = await admin.from("profiles").delete().eq("id", userId);
    if (profileErr) return json(500, { error: "Failed to delete profile" });

    // Delete auth user (requires service role)
    const { error: authDelErr } = await admin.auth.admin.deleteUser(userId);
    if (authDelErr) return json(500, { error: "Failed to delete auth user" });

    return json(200, { ok: true });
  } catch (e) {
    console.error("delete-account error:", e);
    return json(500, { error: "Unexpected error" });
  }
});

