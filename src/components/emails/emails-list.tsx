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
}

interface EmailsListProps {
  userId: string;
}

const POLL_INTERVAL = 30000;

export function EmailsList({ userId }: EmailsListProps) {
  const [emails, setEmails] = useState<GmailEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [autoPolling, setAutoPolling] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();

  const fetchEmails = useCallback(async () => {
    const { data } = await supabase
      .from("emails")
      .select("*")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(20);

    setEmails(data ?? []);
    setLoading(false);
  }, [supabase, userId]);

  const handleSync = useCallback(async (silent = false) => {
    if (!accessToken) return;
    if (!silent) setSyncing(true);

    try {
      const res = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const data = await res.json();

      if (data.error) {
        if (!silent) toast.add({ type: "error", title: "Sync failed", description: data.error });
      } else {
        if (!silent && data.synced > 0) {
          toast.add({ type: "success", title: "Emails synced", description: `${data.synced} new email(s) found` });
        }
        await fetchEmails();
        setLastSyncTime(new Date());
      }
    } catch (error) {
      if (!silent) toast.add({ type: "error", title: "Sync failed", description: "Check console for details" });
      console.error("Sync failed:", error);
    } finally {
      if (!silent) setSyncing(false);
    }
  }, [accessToken, fetchEmails]);

  const handleProcess = useCallback(async (silent = false) => {
    if (!silent) setProcessing(true);

    try {
      const res = await fetch("/api/ai/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.error) {
        if (!silent) toast.add({ type: "error", title: "Processing failed", description: data.error });
      } else {
        const tasksCreated = data.results?.filter((r: { extraction: { action_required: boolean } }) => r.extraction.action_required).length ?? 0;
        if (!silent && data.processed > 0) {
          toast.add({ type: "success", title: "Emails processed", description: `${tasksCreated} task(s) created/updated from ${data.processed} email(s)` });
        }
        await fetchEmails();
      }
    } catch (error) {
      if (!silent) toast.add({ type: "error", title: "Processing failed", description: "Check console for details" });
      console.error("Process failed:", error);
    } finally {
      if (!silent) setProcessing(false);
    }
  }, [fetchEmails]);

  const runAutoPoll = useCallback(async () => {
    if (!accessToken) return;
    await handleSync(true);
    await handleProcess(true);
  }, [accessToken, handleSync, handleProcess]);

  useEffect(() => {
    checkGmailConnection();
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (autoPolling && gmailConnected && accessToken) {
      runAutoPoll();
      pollRef.current = setInterval(runAutoPoll, POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [autoPolling, gmailConnected, accessToken, runAutoPoll]);

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

    setLoading(false);
  };

  const handleConnectGmail = async () => {
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

  const unprocessedCount = emails.filter((e) => !e.processed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg">Recent Emails</CardTitle>
          {unprocessedCount > 0 && (
            <Badge variant="secondary">{unprocessedCount} unprocessed</Badge>
          )}
          {autoPolling && lastSyncTime && (
            <Badge variant="outline" className="text-xs">
              {syncing || processing ? "Syncing..." : `Last synced ${Math.round((Date.now() - lastSyncTime.getTime()) / 1000)}s ago`}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoPolling ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoPolling(!autoPolling)}
          >
            {autoPolling ? "Auto: ON" : "Auto: OFF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync()}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Sync"}
          </Button>
          {unprocessedCount > 0 && (
            <Button
              size="sm"
              onClick={() => handleProcess()}
              disabled={processing}
            >
              {processing ? "Processing..." : `Process ${unprocessedCount}`}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading emails...</p>
        ) : emails.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
            <p className="text-sm font-medium">No emails synced yet</p>
            <p className="text-xs text-muted-foreground mt-1">Emails will appear here automatically when synced.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <div
                key={email.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{email.subject}</p>
                    {!email.processed && (
                      <Badge variant="secondary" className="shrink-0">New</Badge>
                    )}
                    {email.processed && (
                      <Badge variant="outline" className="shrink-0">Processed</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    From: {email.from_name} ({email.from_address})
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {email.snippet}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap ml-3">
                  {new Date(email.received_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
