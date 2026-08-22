"use client";

export interface ActionResult {
  action: string;
  params: Record<string, unknown>;
  result?: { success: boolean; task?: { id: string; title: string; [key: string]: unknown }; goal?: { id: string; title: string; [key: string]: unknown } };
}

const actionLabels: Record<string, string> = {
  update_task_deadline: "Moved deadline",
  create_task: "Created task",
  update_task_status: "Updated status",
  update_task_priority: "Changed priority",
  create_goal: "Created goal",
};

export function ActionCard({ action }: { action: ActionResult }) {
  const success = action.result?.success ?? false;
  const label = actionLabels[action.action] ?? action.action.replace(/_/g, " ");

  return (
    <div className={`rounded-lg border px-3 py-2 ${
      success
        ? "bg-green-50 border-green-200"
        : "bg-red-50 border-red-200"
    }`}>
      <div className="flex items-center gap-2">
        {success ? (
          <svg className="h-4 w-4 text-green-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg className="h-4 w-4 text-red-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        )}
        <span className={`text-sm font-medium ${success ? "text-green-700" : "text-red-700"}`}>
          {success ? `✅ ${label}` : `❌ ${label} failed`}
        </span>
      </div>
      {action.result?.task && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Task: {action.result.task.title}
        </p>
      )}
      {action.result?.goal && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          Goal: {action.result.goal.title}
        </p>
      )}
    </div>
  );
}
