"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecommendationCard } from "./recommendation-card";
import { parseRobinResponse } from "@/lib/robin/parse-response";
import type { TaskRecommendation } from "@/lib/robin/parse-response";
import { clearRobinCache } from "./robin-sidebar";

const CACHE_KEY = "robin_recommendations";
const CACHE_TTL = 5 * 60 * 1000;

export { clearRobinCache };

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: TaskRecommendation[];
  summary?: string;
}

interface ClarificationEmail {
  id: string;
  subject: string | null;
  clarification_question: string | null;
  from_name: string | null;
}

interface RobinSidebarProps {
  userName?: string;
  taskCount?: number;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const quickQuestions = [
  "What should I work on today?",
  "What is overdue?",
  "What changed today?",
  "What needs my attention?",
];

export function RobinSidebar({ userName }: RobinSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<TaskRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clarification state
  const [clarifications, setClarifications] = useState<ClarificationEmail[]>([]);
  const [clarifyingEmail, setClarifyingEmail] = useState<ClarificationEmail | null>(null);
  const [clarifyLoading, setClarifyLoading] = useState(false);
  const [clarifySuccess, setClarifySuccess] = useState<{ title: string; deadline: string | null } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (chatOpen) scrollToBottom();
  }, [messages, chatOpen]);

  // Load recommendations + pending clarifications
  useEffect(() => {
    async function loadData() {
      try {
        // Check cache first
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setRecommendations(data);
            setLoading(false);
            // Still fetch clarifications (not cached)
            fetchClarifications();
            return;
          }
        }
      } catch { /* ignore, fall through */ }

      try {
        const res = await fetch("/api/ai/robin");
        if (res.ok) {
          const data = await res.json();
          const { recommendations: recs } = parseRobinResponse(data.recommendations || data.response || "");
          const sliced = recs.slice(0, 3);
          setRecommendations(sliced);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: sliced, timestamp: Date.now() }));
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      fetchClarifications();
      setLoading(false);
    }

    async function fetchClarifications() {
      try {
        const res = await fetch("/api/ai/clarify/list");
        if (res.ok) {
          const data = await res.json();
          setClarifications(data.clarifications ?? []);
        }
      } catch { /* ignore */ }
    }

    loadData();
  }, []);

  const handleQuickAsk = async (question: string) => {
    setChatOpen(true);
    const userMessage: Message = { role: "user", content: question };
    setMessages([userMessage]);
    setChatLoading(true);
    isLoadingRef.current = true;

    try {
      const res = await fetch("/api/ai/robin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      });
      const data = await res.json();
      const { cleanText, recommendations: recs, summary } = parseRobinResponse(data.response || "");
      setMessages([{ role: "user", content: question }, {
        role: "assistant",
        content: cleanText,
        recommendations: recs.length > 0 ? recs : undefined,
        summary: summary || undefined,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setChatLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoadingRef.current) return;
    isLoadingRef.current = true;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/robin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      const { cleanText, recommendations: recs, summary } = parseRobinResponse(data.response || "");
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: cleanText,
        recommendations: recs.length > 0 ? recs : undefined,
        summary: summary || undefined,
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setChatLoading(false);
      isLoadingRef.current = false;
    }
  };

  const handleClarify = async (deadline: string | null) => {
    if (!clarifyingEmail) return;
    setClarifyLoading(true);

    try {
      const res = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: clarifyingEmail.id, deadline }),
      });
      const data = await res.json();

      if (data.task) {
        setClarifySuccess({ title: data.task.title, deadline: data.task.deadline });
        clearRobinCache();
        // Remove from pending list
        setClarifications((prev) => prev.filter((c) => c.id !== clarifyingEmail.id));
        // Refresh recommendations
        try {
          const recRes = await fetch("/api/ai/robin");
          if (recRes.ok) {
            const recData = await recRes.json();
            const { recommendations: recs } = parseRobinResponse(recData.recommendations || recData.response || "");
            const sliced = recs.slice(0, 3);
            setRecommendations(sliced);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: sliced, timestamp: Date.now() }));
          }
        } catch { /* ignore */ }
      }
    } catch {
      setClarifyLoading(false);
    } finally {
      setClarifyLoading(false);
    }
  };

  // Determine what's missing from the clarification
  const getMissingFields = (q: string | null) => {
    if (!q) return { deadline: true, priority: false };
    const lower = q.toLowerCase();
    return {
      deadline: lower.includes("when") || lower.includes("deadline") || lower.includes("date") || lower.includes("time") || lower.includes("day"),
      priority: lower.includes("important") || lower.includes("priority") || lower.includes("urgent"),
    };
  };

  const today = new Date().toISOString().split("T")[0];
  const endOfWeek = new Date();
  endOfWeek.setDate(endOfWeek.getDate() + (5 - endOfWeek.getDay()));
  const endOfWeekStr = endOfWeek.toISOString().split("T")[0];
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().split("T")[0];

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Robin</h2>
            <p className="text-xs text-muted-foreground">{getGreeting()}, {userName || "there"}</p>
          </div>
          {!pathname.startsWith("/robin") && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/robin")} className="text-xs">
              Open full
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Clarification panel (when answering a clarification) */}
        {clarifyingEmail ? (
          <div className="space-y-3">
            <button
              onClick={() => { setClarifyingEmail(null); setClarifySuccess(null); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back
            </button>

            {clarifySuccess ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-1">
                <p className="text-sm font-medium text-green-800">✓ Task created</p>
                <p className="text-xs text-green-700">{clarifySuccess.title}</p>
                {clarifySuccess.deadline && (
                  <p className="text-xs text-green-600">Due: {clarifySuccess.deadline}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
                  <p className="text-xs font-medium text-primary mb-1">Robin needs your input</p>
                  <p className="text-sm font-medium">{clarifyingEmail.subject || "Untitled email"}</p>
                  {clarifyingEmail.clarification_question && (
                    <p className="text-xs text-muted-foreground mt-1">{clarifyingEmail.clarification_question}</p>
                  )}
                </div>

                {(() => {
                  const missing = getMissingFields(clarifyingEmail.clarification_question);
                  return (
                    <div className="space-y-2">
                      {missing.deadline && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">When should this be done?</p>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={clarifyLoading}
                              onClick={() => handleClarify(today)}
                            >
                              Today
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={clarifyLoading}
                              onClick={() => handleClarify(endOfWeekStr)}
                            >
                              This week
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              disabled={clarifyLoading}
                              onClick={() => handleClarify(nextWeekStr)}
                            >
                              Later
                            </Button>
                          </div>
                        </div>
                      )}
                      {!missing.deadline && (
                        <Button
                          className="w-full text-xs"
                          size="sm"
                          disabled={clarifyLoading}
                          onClick={() => handleClarify(null)}
                        >
                          {clarifyLoading ? "Creating..." : "Create task without deadline"}
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : !chatOpen ? (
          <>
            {/* Pending clarifications */}
            {clarifications.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-amber-600 uppercase tracking-wide flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Needs your input · {clarifications.length}
                </h3>
                {clarifications.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setClarifyingEmail(c); setClarifySuccess(null); }}
                    className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 hover:bg-amber-50 transition-colors"
                  >
                    <p className="text-sm font-medium leading-snug truncate">{c.subject || "Untitled email"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {c.clarification_question || "Needs more context"}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[11px] text-primary mt-1">
                      Answer →
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Initial recommendations */}
            {loading ? (
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-24" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : recommendations.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Robin recommends</h3>
                {recommendations.map((rec, i) => (
                  <RecommendationCard key={i} rec={rec} isFirst={i === 0} compact />
                ))}
              </div>
            ) : clarifications.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 space-y-2">
                <p className="text-sm">No recommendations yet.</p>
                <p className="text-xs">Sync Gmail or add tasks to get started.</p>
              </div>
            ) : null}

            {/* Quick ask buttons */}
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Quick ask</h3>
              <div className="flex flex-wrap gap-1.5">
                {quickQuestions.map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="text-xs h-auto py-1.5"
                    onClick={() => handleQuickAsk(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Chat messages */
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}>
                  {msg.summary && (
                    <p className="text-xs font-medium text-primary mb-1">{msg.summary}</p>
                  )}
                  {msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {msg.recommendations.map((rec, j) => (
                        <RecommendationCard key={j} rec={rec} isFirst={j === 0} compact />
                      ))}
                    </div>
                  )}
                  {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                  Robin is thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        {chatOpen ? (
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Robin..."
              disabled={chatLoading}
              className="flex-1 text-sm"
            />
            <Button type="submit" size="sm" disabled={chatLoading || !input.trim()}>
              {chatLoading ? "..." : "Send"}
            </Button>
          </form>
        ) : (
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={() => setChatOpen(true)}
          >
            Ask Robin something...
          </Button>
        )}
      </div>
    </div>
  );
}
