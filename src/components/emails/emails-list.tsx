"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";

interface GmailEmail {
  id: string;
  subject: string;
  snippet: string;
  from_name: string;
  from_address: string;
  received_at: string;
  processed: boolean;
  processing_status: string;
}

interface EmailsListProps {
  userId: string;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export function EmailsList({ userId }: EmailsListProps) {
  const [emails, setEmails] = useState<GmailEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [hasSynced, setHasSynced] = useState(false);
  const [visibleCount, setVisibleCount] = useState(15);
  const emailsRef = useRef(emails);
  const supabase = createClient();

  // Keep ref in sync with state
  emailsRef.current = emails;

  const fetchEmails = useCallback(async () => {
    const { data } = await supabase
      .from("emails")
      .select("*")
      .eq("user_id", userId)
      .order("received_at", { ascending: false });

    setEmails(data ?? []);
    setLoading(false);
    return data ?? [];
  }, [supabase, userId]);

  const handleSync = useCallback(async (silent = false) => {
    if (!accessToken) return;
    if (!silent) setSyncing(true);

    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.error) {
        if (!silent) toast.add({ type: "error", title: "Sync failed", description: data.error });
      } else {
        if (!silent && data.synced > 0) {
          toast.add({ type: "success", title: "Emails synced", description: `${data.synced} new email(s) found` });
        }
        const freshEmails = await fetchEmails();
        setLastSyncTime(new Date());
        setHasSynced(true);

        // Auto-chain: process all unprocessed emails in batches of 5
        if (!silent) setProcessing(true);
        let totalProcessed = 0;
        let totalTasks = 0;
        let remaining = freshEmails.filter(e => !e.processed).length;

        try {
          while (remaining > 0) {
            const processRes = await fetch("/api/ai/understand", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const processData = await processRes.json();

            if (processData.error) {
              if (!silent) toast.add({ type: "error", title: "Processing stopped", description: processData.error });
              break;
            }

            totalProcessed += processData.processed ?? 0;
            const batchTasks = processData.results?.filter((r: { status: string }) => r.status === "task_created" || r.status === "task_updated").length ?? 0;
            totalTasks += batchTasks;
            remaining = processData.remaining ?? 0;

            await fetchEmails();

            // Small delay between batches to respect rate limits
            if (remaining > 0) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          if (!silent && totalProcessed > 0) {
            toast.add({
              type: "success",
              title: "Emails analyzed",
              description: `${totalTasks} task(s) created from ${totalProcessed} email(s)`,
            });
          }
        } catch (processError) {
          if (!silent) toast.add({ type: "error", title: "Processing failed", description: "Check console for details" });
          console.error("Auto-process failed:", processError);
        } finally {
          if (!silent) setProcessing(false);
        }
      }
    } catch (error) {
      if (!silent) toast.add({ type: "error", title: "Sync failed", description: "Check console for details" });
      console.error("Sync failed:", error);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [accessToken, fetchEmails]);

  useEffect(() => {
    const init = async () => {
      await checkGmailConnection();
      await fetchEmails();
    };
    init();
  }, []);

  const checkGmailConnection = async () => {
    const { data } = await supabase
      .from("linked_accounts")
      .select("access_token, expires_at")
      .eq("user_id", userId)
      .eq("provider", "google")
      .single();

    if (data?.access_token) {
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setGmailConnected(false);
      } else {
        setGmailConnected(true);
        setAccessToken(data.access_token);
        return;
      }
    }

    // Fallback: try to get token from Supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.provider_token) {
      const tokenExpiry = new Date(
        Date.now() + (session.expires_in ?? 3600) * 1000
      ).toISOString();

      const { data: existing } = await supabase
        .from("linked_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "google")
        .single();

      if (existing) {
        await supabase
          .from("linked_accounts")
          .update({
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token ?? null,
            expires_at: tokenExpiry,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("linked_accounts").insert({
          user_id: userId,
          provider: "google",
          access_token: session.provider_token,
          refresh_token: session.provider_refresh_token ?? null,
          expires_at: tokenExpiry,
        });
      }

      setGmailConnected(true);
      setAccessToken(session.provider_token);
      return;
    }

  };

  const handleConnectGmail = async () => {
    if (!window.confirm("This will sign you out so you can re-authenticate with Gmail permissions. Continue?")) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  if (!gmailConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gmail Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            To connect Gmail, sign out and sign back in with Google.
          </p>
          <Button onClick={handleConnectGmail}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            Re-login to Connect Gmail
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = emails.filter((e) => e.processing_status === "pending" || !e.processed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${syncing || processing ? "bg-amber-500 animate-pulse" : "bg-green-500"}`} />
            <CardTitle className="text-lg">Gmail</CardTitle>
          </div>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700">{pendingCount} pending</Badge>
          )}
          {lastSyncTime && (
            <span className="text-xs text-muted-foreground">
              {syncing ? "Syncing Gmail..." : processing ? "Analyzing emails..." : `Last synced ${formatTimeAgo(lastSyncTime)}`}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync()}
            disabled={syncing || processing}
          >
            {syncing ? "Syncing..." : processing ? "Analyzing..." : "Sync Gmail"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading emails...</p>
        ) : !hasSynced && emails.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <p className="text-sm font-medium">Sync your Gmail to get started</p>
            <p className="text-xs text-muted-foreground mt-1">Emails will be analyzed and turned into tasks automatically.</p>
            <Button size="sm" className="mt-3" onClick={() => handleSync()} disabled={syncing}>
              {syncing ? "Syncing..." : "Sync Gmail"}
            </Button>
          </div>
        ) : emails.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <p className="text-sm font-medium">No emails found</p>
            <p className="text-xs text-muted-foreground mt-1">Your inbox is clean or no action-required emails were found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {emails.slice(0, visibleCount).map((email) => {
              const status = email.processing_status || (email.processed ? "no_action_required" : "pending");
              const rowStyle = !email.processed
                ? "bg-blue-50/50 border-blue-100"
                : status === "task_created"
                ? "bg-green-50/30 border-green-100"
                : status === "task_updated"
                ? "bg-blue-50/30 border-blue-100"
                : status === "needs_clarification"
                ? "bg-amber-50/30 border-amber-100"
                : status === "ai_failed"
                ? "bg-orange-50/30 border-orange-100"
                : "";

              return (
                <div
                  key={email.id}
                  className={`flex items-start justify-between rounded-lg border p-3 transition-colors ${rowStyle}`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{email.from_name || email.from_address}</p>
                      {status === "pending" && (
                        <Badge className="shrink-0 bg-gray-100 text-gray-600">Pending</Badge>
                      )}
                      {status === "task_created" && (
                        <Badge className="shrink-0 bg-green-100 text-green-700">✓ Task created</Badge>
                      )}
                      {status === "task_updated" && (
                        <Badge className="shrink-0 bg-blue-100 text-blue-700">↻ Task updated</Badge>
                      )}
                      {status === "no_action_required" && (
                        <Badge variant="secondary" className="shrink-0 text-muted-foreground">No action</Badge>
                      )}
                      {status === "needs_clarification" && (
                        <Badge className="shrink-0 bg-amber-100 text-amber-700">? Needs clarification</Badge>
                      )}
                      {status === "ai_failed" && (
                        <Badge className="shrink-0 bg-orange-100 text-orange-700">⟳ Needs retry</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{email.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {email.snippet}
                    </p>
                    {status === "needs_clarification" && (
                      <a
                        href="/robin"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 8V4H8" />
                          <rect width="16" height="12" x="4" y="8" rx="2" />
                          <path d="M2 14h2" />
                          <path d="M20 14h2" />
                        </svg>
                        Ask Robin about this
                      </a>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                    {new Date(email.received_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
            {visibleCount < emails.length && (
              <div className="text-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((prev) => prev + 15)}
                >
                  Load more ({emails.length - visibleCount} remaining)
                </Button>
              </div>
            )}
            {emails.length > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Showing {Math.min(visibleCount, emails.length)} of {emails.length} emails
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
