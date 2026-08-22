import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { access_token, refresh_token, expires_at } = await request.json();

  if (!access_token) {
    return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
  }

  // Upsert linked account
  const { data: existing } = await supabase
    .from("linked_accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .single();

  if (existing) {
    await supabase
      .from("linked_accounts")
      .update({
        access_token,
        refresh_token: refresh_token ?? null,
        expires_at: expires_at ?? null,
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("linked_accounts").insert({
      user_id: user.id,
      provider: "google",
      access_token,
      refresh_token: refresh_token ?? null,
      expires_at: expires_at ?? null,
    });
  }

  return NextResponse.json({ success: true });
}
