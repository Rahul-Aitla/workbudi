import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { access_token } = await request.json();

  if (!access_token) {
    return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  try {
    // Get the latest synced email's gmail_id
    const { data: latestEmail } = await supabase
      .from("emails")
      .select("received_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(1)
      .single();

    const afterDate = latestEmail
      ? Math.floor(new Date(latestEmail.received_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000) - 86400; // Last 24 hours

    // Fetch recent inbox messages
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `in:inbox after:${afterDate}`,
      maxResults: 20,
    });

    const messages = listRes.data.messages ?? [];
    let newEmails = 0;

    for (const msg of messages) {
      if (!msg.id) continue;

      const { data: existing } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", msg.id)
        .single();

      if (existing) continue;

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

      await supabase.from("emails").insert({
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

      newEmails++;
    }

    // Second pass: sync sent emails that reply to existing threads
    const sentRes = await gmail.users.messages.list({
      userId: "me",
      q: `in:sent after:${afterDate}`,
      maxResults: 20,
    });

    const sentMessages = sentRes.data.messages ?? [];
    let syncedSent = 0;

    for (const msg of sentMessages) {
      if (!msg.id) continue;

      const { data: existing } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", msg.id)
        .single();

      if (existing) continue;

      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const inReplyTo = headers.find((h) => h.name === "In-Reply-To")?.value ?? null;

      if (!inReplyTo) continue;

      // Check if this replies to an email we already have
      const { data: parentEmail } = await supabase
        .from("emails")
        .select("id")
        .eq("gmail_id", inReplyTo)
        .eq("user_id", user.id)
        .single();

      if (!parentEmail) continue;

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

      await supabase.from("emails").insert({
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

      syncedSent++;
    }

    return NextResponse.json({ newEmails: newEmails + syncedSent, checked: messages.length + sentMessages.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Gmail poll error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
