import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Validate next is a relative path to prevent open redirect
  const safeNext = next.startsWith("/") && !next.includes("://") ? next : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Try to store the Google/Gmail provider token
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      if (providerToken) {
        const tokenExpiry = new Date(
          Date.now() + (data.session.expires_in ?? 3600) * 1000
        ).toISOString();

        const { data: existing } = await supabase
          .from("linked_accounts")
          .select("id")
          .eq("user_id", data.session.user.id)
          .eq("provider", "google")
          .single();

        if (existing) {
          await supabase
            .from("linked_accounts")
            .update({
              access_token: providerToken,
              refresh_token: providerRefreshToken ?? null,
              expires_at: tokenExpiry,
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("linked_accounts").insert({
            user_id: data.session.user.id,
            provider: "google",
            access_token: providerToken,
            refresh_token: providerRefreshToken ?? null,
            expires_at: tokenExpiry,
          });
        }
      }
      // If no provider_token, the scopes might not be configured in Supabase.
      // User can still use the app, just Gmail features won't work until tokens are stored.

      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
