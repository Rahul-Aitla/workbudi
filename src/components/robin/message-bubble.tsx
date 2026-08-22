"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TaskRecommendation {
  rank: number;
  title: string;
  task_id?: string;
  priority: number;
  deadline?: string;
  why: string;
  is_overdue?: boolean;
}

const priorityConfig: Record<number, { color: string; bg: string; border: string }> = {
  1: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  2: { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  3: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  4: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  5: { color: "text-red-700", bg: "bg-red-100", border: "border-red-300" },
};

const rankIcons = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

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

export function RecommendationCard({ rec }: { rec: TaskRecommendation }) {
  const p = priorityConfig[rec.priority] ?? priorityConfig[3];

  return (
    <div className={`rounded-lg border ${p.border} ${p.bg} p-3 space-y-1.5`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{rankIcons[rec.rank - 1] || `${rec.rank}.`}</span>
          <span className="font-medium text-sm truncate">{rec.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {rec.is_overdue && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue</Badge>
          )}
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.color} ${p.bg} border-current/20`}>
            P{rec.priority}
          </Badge>
        </div>
      </div>
      {rec.deadline && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          Due: {new Date(rec.deadline).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
        </div>
      )}
      <p className="text-xs text-muted-foreground leading-relaxed">{rec.why}</p>
    </div>
  );
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
              <RecommendationCard key={j} rec={rec} />
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
