"use client";

import { Card, CardContent } from "@/components/ui/card";
import { RecommendationCard } from "./recommendation-card";
import type { TaskRecommendation } from "@/lib/robin/parse-response";

export type { TaskRecommendation };

function formatInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="bg-muted px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}

function formatMarkdown(text: string) {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.map((line, i) => {
    if (line.startsWith("- ")) {
      return (
        <div key={i} className="flex items-start gap-2 ml-2">
          <span className="text-primary mt-0.5 shrink-0">•</span>
          <span className="text-sm">{formatInline(line.slice(2))}</span>
        </div>
      );
    }
    return <p key={i} className="text-sm leading-relaxed">{formatInline(line)}</p>;
  });
}

export function MessageBubble({ msg }: { msg: { role: string; content: string; summary?: string; recommendations?: TaskRecommendation[]; tips?: string[] } }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "" : "space-y-3"}`}>
        {msg.summary && (
          <div className="rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <p className="text-sm font-medium text-primary">{msg.summary}</p>
          </div>
        )}

        {msg.recommendations && msg.recommendations.length > 0 && (
          <div className="space-y-2">
            {msg.recommendations.map((rec, j) => (
              <RecommendationCard key={j} rec={rec} isFirst={j === 0} />
            ))}
          </div>
        )}

        {msg.content && (
          <Card className={isUser ? "bg-primary text-primary-foreground" : ""}>
            <CardContent className="p-3 space-y-1">
              {isUser ? <p className="text-sm">{msg.content}</p> : formatMarkdown(msg.content)}
            </CardContent>
          </Card>
        )}

        {msg.tips && msg.tips.length > 0 && (
          <div className="rounded-lg bg-muted/50 border px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tips</p>
            {msg.tips.map((tip, j) => (
              <p key={j} className="text-xs text-muted-foreground">• {tip}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
