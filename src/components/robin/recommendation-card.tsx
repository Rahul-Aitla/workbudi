"use client";

import { Badge } from "@/components/ui/badge";
import type { TaskRecommendation } from "@/lib/robin/parse-response";

const priorityConfig: Record<number, { color: string; bg: string; border: string; label: string }> = {
  1: { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", label: "Low" },
  2: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Medium" },
  3: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", label: "High" },
  4: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Urgent" },
  5: { color: "text-red-700", bg: "bg-red-100", border: "border-red-300", label: "Critical" },
};

function getDeadlineInfo(deadline: string): { text: string; className: string } {
  const due = new Date(deadline);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)}d`, className: "text-red-600 bg-red-50" };
  if (diffDays === 0) return { text: "Due today", className: "text-amber-600 bg-amber-50" };
  if (diffDays === 1) return { text: "Due tomorrow", className: "text-amber-600 bg-amber-50" };
  return { text: `Due in ${diffDays}d`, className: "text-muted-foreground bg-muted" };
}

interface RecommendationCardProps {
  rec: TaskRecommendation;
  isFirst?: boolean;
  compact?: boolean;
}

export function RecommendationCard({ rec, isFirst, compact }: RecommendationCardProps) {
  const p = priorityConfig[rec.priority] ?? priorityConfig[3];
  const deadlineInfo = rec.deadline ? getDeadlineInfo(rec.deadline) : null;

  if (compact) {
    return (
      <div className={`rounded-md border ${p.border} ${p.bg} p-2.5 space-y-1.5 ${isFirst ? "ring-1 ring-primary/20" : ""}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold shrink-0 ${isFirst ? "text-primary" : "text-muted-foreground"}`}>
            #{rec.rank}
          </span>
          <span className="text-sm font-medium leading-snug truncate">{rec.title}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {deadlineInfo && (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${deadlineInfo.className}`}>
              {deadlineInfo.text}
            </span>
          )}
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.color} ${p.bg} border-current/20`}>
            P{rec.priority}
          </Badge>
          {rec.source === "email" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-600">
              📧 Gmail
            </Badge>
          )}
        </div>

        {rec.why && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">
            <span className="font-medium text-foreground">Why: </span>{rec.why}
          </p>
        )}

        {rec.task_id && (
          <a
            href="/tasks"
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Open →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${p.border} ${p.bg} p-3.5 space-y-2.5 ${isFirst ? "ring-2 ring-primary/20" : ""}`}>
      {/* Rank + Title */}
      <div className="flex items-start gap-2.5">
        <span className={`text-lg font-bold shrink-0 leading-none ${isFirst ? "text-primary" : "text-muted-foreground"}`}>
          #{rec.rank}
        </span>
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm leading-snug">{rec.title}</span>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {deadlineInfo && (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${deadlineInfo.className}`}>
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            {deadlineInfo.text}
          </span>
        )}
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.color} ${p.bg} border-current/20`}>
          P{rec.priority} · {p.label}
        </Badge>
        {rec.source === "email" && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-600">
            📧 From Gmail
          </Badge>
        )}
        {rec.is_overdue && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Overdue</Badge>
        )}
      </div>

      {/* Why section */}
      {rec.why && (
        <div className="rounded bg-white/50 px-2.5 py-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground uppercase tracking-wide text-[10px]">
              {isFirst ? "Why this first" : "Why"}:{" "}
            </span>
            {rec.why}
          </p>
        </div>
      )}

      {/* Open task link */}
      {rec.task_id && (
        <a
          href="/tasks"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open task
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </a>
      )}
    </div>
  );
}
