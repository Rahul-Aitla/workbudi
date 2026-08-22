"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Task, Email } from "@/types/database";

interface TaskCardProps {
  task: Task;
  email?: Email | null;
  onEdit: () => void;
  onDelete: () => void;
}

const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "bg-blue-100 text-blue-800" },
  2: { label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  3: { label: "High", color: "bg-orange-100 text-orange-800" },
  4: { label: "Urgent", color: "bg-red-100 text-red-800" },
  5: { label: "Critical", color: "bg-red-200 text-red-900" },
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export function TaskCard({ task, email, onEdit, onDelete }: TaskCardProps) {
  const [emailExpanded, setEmailExpanded] = useState(false);
  const priority = priorityLabels[task.priority] ?? priorityLabels[3];
  const isOverdue =
    task.deadline && task.status !== "done" && new Date(task.deadline) < new Date();

  return (
    <Card className={isOverdue ? "border-red-300" : ""}>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <CardTitle className="text-lg">{task.title}</CardTitle>
          <div className="flex flex-wrap gap-1">
            <Badge className={priority.color}>P{task.priority}</Badge>
            <Badge variant="outline">{statusLabels[task.status]}</Badge>
            {task.source === "email" && (
              <Badge variant="secondary">Email</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground">{task.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {task.deadline && (
            <span className={isOverdue ? "text-red-600 font-medium" : ""}>
              Due: {new Date(task.deadline).toLocaleDateString()}
              {isOverdue && " (Overdue)"}
            </span>
          )}
        </div>

        {/* Linked Email Section */}
        {task.source === "email" && email && (
          <div className="rounded-lg border bg-muted/30 overflow-hidden">
            <button
              onClick={() => setEmailExpanded(!emailExpanded)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span className="text-sm font-medium truncate">{email.subject}</span>
              </div>
              <svg
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${emailExpanded ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {emailExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t">
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

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
