import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch access token from DB instead of accepting from client
  const { data: account } = await supabase
    .from("linked_accounts")
    .select("access_token")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .single();

  if (!account?.access_token) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: account.access_token });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    console.log("[Gmail Sync] Starting sync for user:", user.id);
    console.log("[Gmail Sync] Token length:", account.access_token.length);

    // Fetch last 50 inbox emails
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 50,
    });

    const messages = listRes.data.messages ?? [];
    console.log("[Gmail Sync] Found messages:", messages.length);

    let synced = 0;
    let skipped = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      // Check if already synced
      const { data: existing } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", msg.id)
        .single();

      if (existing) {
        skipped++;
        continue;
      }

      // Fetch full message
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const fromRaw = headers.find((h) => h.name === "From")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";
      const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value ?? null;

      // Parse "Name <email>" format
      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
      const from_name = fromMatch ? fromMatch[1].trim() : fromRaw;
      const from_address = fromMatch ? fromMatch[2] : fromRaw;

      // Extract body
      let body = "";
      const payload = fullMsg.data.payload;
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
      } else if (payload?.parts) {
        const textPart = payload.parts.find(
          (p) => p.mimeType === "text/plain"
        );
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
        }
      }

      const { error: insertError } = await supabase.from("emails").insert({
        user_id: user.id,
        gmail_id: msg.id,
        thread_id: fullMsg.data.threadId ?? null,
        subject,
        snippet: fullMsg.data.snippet ?? "",
        from_address,
        from_name,
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        body: body.slice(0, 10000),
        processed: false,
        in_reply_to: inReplyTo,
      });

      if (insertError) {
        console.error("[Gmail Sync] Insert error:", insertError);
      } else {
        synced++;
      }
    }

    console.log("[Gmail Sync] Done. Synced:", synced, "Skipped:", skipped);

    // Second pass: sync sent emails that reply to existing threads
    const sentRes = await gmail.users.messages.list({
      userId: "me",
      q: "in:sent newer_than:30d",
      maxResults: 30,
    });

    const sentMessages = sentRes.data.messages ?? [];
    console.log("[Gmail Sync] Found sent messages:", sentMessages.length);

    let syncedSent = 0;

    for (const msg of sentMessages) {
      if (!msg.id) continue;

      // Check if already synced
      const { data: existing } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", msg.id)
        .single();

      if (existing) continue;

      // Fetch full message to get In-Reply-To header
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value ?? null;

      // Only sync if it replies to an email we already have
      if (!inReplyTo) continue;

      const { data: parentEmail } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", inReplyTo)
        .eq("user_id", user.id)
        .single();

      if (!parentEmail) continue;

      // This sent email is a reply to an existing thread — sync it
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const fromRaw = headers.find((h) => h.name === "From")?.value ?? "";
      const date = headers.find((h) => h.name === "Date")?.value ?? "";

      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
      const from_name = fromMatch ? fromMatch[1].trim() : fromRaw;
      const from_address = fromMatch ? fromMatch[2] : fromRaw;

      let body = "";
      const payload = fullMsg.data.payload;
      if (payload?.body?.data) {
        body = Buffer.from(payload.body.data, "base64url").toString("utf-8");
      } else if (payload?.parts) {
        const textPart = payload.parts.find(
          (p) => p.mimeType === "text/plain"
        );
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
        }
      }

      const { error: insertError } = await supabase.from("emails").insert({
        user_id: user.id,
        gmail_id: msg.id,
        thread_id: fullMsg.data.threadId ?? null,
        subject,
        snippet: fullMsg.data.snippet ?? "",
        from_address,
        from_name,
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        body: body.slice(0, 10000),
        processed: false,
        in_reply_to: inReplyTo,
      });

      if (!insertError) syncedSent++;
    }

    console.log("[Gmail Sync] Synced sent replies:", syncedSent);
    return NextResponse.json({ synced: synced + syncedSent, skipped, total: messages.length + sentMessages.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Gmail Sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
