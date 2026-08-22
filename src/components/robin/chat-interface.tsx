"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBubble, type TaskRecommendation } from "./message-bubble";
import { ActionCard, type ActionResult } from "./action-card";

interface Message {
  role: "user" | "assistant";
  content: string;
  recommendations?: TaskRecommendation[];
  summary?: string;
  tips?: string[];
  action?: ActionResult;
}

function parseRobinResponse(content: string) {
  let cleanText = content;
  let recommendations: TaskRecommendation[] = [];
  let summary = "";
  let tips: string[] = [];

  const structMatch = content.match(/<!--RECOMMENDATIONS\s*\n?([\s\S]*?)-->/);
  if (structMatch) {
    try {
      const parsed = JSON.parse(structMatch[1]);
      recommendations = parsed.recommendations ?? [];
      summary = parsed.summary ?? "";
      tips = parsed.tips ?? [];
    } catch { /* ignore parse errors */ }
    cleanText = content.replace(/<!--RECOMMENDATIONS\s*\n?[\s\S]*?-->/, "").trim();
  }

  cleanText = cleanText.replace(/\{"action":\s*"[^"]+",\s*"params":\s*\{[\s\S]*?\}\}/g, "").trim();

  return { cleanText, recommendations, summary, tips };
}

function extractAction(content: string) {
  const actionMatch = content.match(/\{"action":\s*"[^"]+",\s*"params":\s*\{[^}]+\}\}/);
  if (!actionMatch) return null;
  try {
    const parsed = JSON.parse(actionMatch[0]);
    if (parsed.action && parsed.params) return { action: parsed.action, params: parsed.params };
  } catch { /* ignore */ }
  return null;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const executeAction = async (action: { action: string; params: Record<string, unknown> }) => {
    try {
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      return await res.json();
    } catch {
      return { success: false, error: "Action failed" };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

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

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Sorry, " + data.error },
        ]);
        return;
      }

      const raw = data.response as string;
      const { cleanText, recommendations, summary, tips } = parseRobinResponse(raw);
      const action = extractAction(raw);

      const assistantMsg: Message = {
        role: "assistant",
        content: cleanText,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
        summary: summary || undefined,
        tips: tips.length > 0 ? tips : undefined,
      };

      if (action) {
        const result = await executeAction(action);
        assistantMsg.action = { ...action, result };
      }

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground space-y-4 py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 8V4H8" />
                <rect width="16" height="12" x="4" y="8" rx="2" />
                <path d="M2 14h2" />
                <path d="M20 14h2" />
                <path d="M15 13v2" />
                <path d="M9 13v2" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Robin AI Assistant</h2>
            <p className="max-w-md mx-auto">I analyze your goals, tasks, and emails to tell you what to focus on right now.</p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {[
                "What should I work on today?",
                "Show me overdue tasks",
                "Create a task for tomorrow",
              ].map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => setInput(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <MessageBubble msg={msg} />
            {msg.action && (
              <div className="max-w-[85%] ml-auto mt-2">
                <ActionCard action={msg.action} />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <Card className="max-w-[80%]">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="animate-bounce">●</span>
                    <span className="animate-bounce" style={{ animationDelay: "0.1s" }}>●</span>
                    <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>●</span>
                  </div>
                  Robin is thinking...
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Robin what to work on..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            {loading ? "..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
