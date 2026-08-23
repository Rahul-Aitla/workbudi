"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Task, Email } from "@/types/database";

interface TaskCardProps {
  task: Task;
  email?: Email | null;
  onEdit: () => void;
  onDelete: () => void;
}

const priorityConfig: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "bg-blue-100 text-blue-700" },
  2: { label: "Medium", color: "bg-amber-100 text-amber-700" },
  3: { label: "High", color: "bg-orange-100 text-orange-700" },
  4: { label: "Urgent", color: "bg-red-100 text-red-700" },
  5: { label: "Critical", color: "bg-red-200 text-red-800" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  todo: { label: "To Do", color: "bg-gray-100 text-gray-700" },
  in_progress: { label: "In Progress", color: "bg-blue-100 text-blue-700" },
  done: { label: "Done", color: "bg-green-100 text-green-700" },
};

function formatDeadline(deadline: string): { text: string; className: string } {
  const due = new Date(deadline);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `Due ${Math.abs(diffDays)}d ago`, className: "text-red-600 font-medium" };
  }
  if (diffDays === 0) {
    return { text: "Due today", className: "text-amber-600 font-medium" };
  }
  if (diffDays === 1) {
    return { text: "Due tomorrow", className: "text-amber-600" };
  }
  if (diffDays <= 3) {
    return { text: `Due in ${diffDays}d`, className: "text-amber-600" };
  }
  return { text: `Due ${due.toLocaleDateString()}`, className: "text-muted-foreground" };
}

export function TaskCard({ task, email, onEdit, onDelete }: TaskCardProps) {
  const [emailExpanded, setEmailExpanded] = useState(false);
  const priority = priorityConfig[task.priority] ?? priorityConfig[3];
  const status = statusConfig[task.status] ?? statusConfig.todo;
  const deadline = task.deadline ? formatDeadline(task.deadline) : null;
  const isOverdue = task.deadline && task.status !== "done" && new Date(task.deadline) < new Date();

  return (
    <Card className={isOverdue ? "border-red-200 bg-red-50/30" : ""}>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug">{task.title}</h3>
          <div className="flex flex-wrap gap-1 shrink-0">
            <Badge className={priority.color}>P{task.priority} · {priority.label}</Badge>
            <Badge className={status.color}>{status.label}</Badge>
            {task.source === "email" && (
              <Badge variant="outline" className="border-blue-200 text-blue-600">Email</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
        )}

        {deadline && (
          <div className={`flex items-center gap-1.5 text-sm ${deadline.className}`}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {deadline.text}
          </div>
        )}

        {/* Linked Email Section */}
        {task.source === "email" && email && (
          <div className="rounded-lg border bg-blue-50/50 overflow-hidden">
            <button
              onClick={() => setEmailExpanded(!emailExpanded)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span className="text-sm font-medium truncate text-blue-700">{email.subject}</span>
              </div>
              <svg
                className={`h-4 w-4 shrink-0 text-blue-400 transition-transform ${emailExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {emailExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-blue-100">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-muted-foreground pt-2">
                  <span>From: {email.from_name || email.from_address}</span>
                  <span>{email.received_at ? new Date(email.received_at).toLocaleDateString() : ""}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                  {email.body || email.snippet}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) onDelete();
          }} className="text-muted-foreground hover:text-destructive">
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
