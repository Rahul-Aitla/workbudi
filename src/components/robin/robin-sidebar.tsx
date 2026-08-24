"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RecommendationCard } from "./recommendation-card";
import { parseRobinResponse } from "@/lib/robin/parse-response";
import type { TaskRecommendation } from "@/lib/robin/parse-response";

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: TaskRecommendation[];
  summary?: string;
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (chatOpen) scrollToBottom();
  }, [messages, chatOpen]);

  useEffect(() => {
    async function loadRecommendations() {
      try {
        const res = await fetch("/api/ai/robin");
        if (!res.ok) return;
        const data = await res.json();
        const { recommendations: recs } = parseRobinResponse(data.recommendations || data.response || "");
        setRecommendations(recs.slice(0, 3));
      } catch { /* ignore */ }
      setLoading(false);
    }
    loadRecommendations();
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
        {!chatOpen ? (
          <>
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
            ) : (
              <div className="text-center text-muted-foreground py-8 space-y-2">
                <p className="text-sm">No recommendations yet.</p>
                <p className="text-xs">Sync Gmail or add tasks to get started.</p>
              </div>
            )}

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
