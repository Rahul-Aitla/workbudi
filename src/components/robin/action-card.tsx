"use client";

export interface ActionResult {
  action: string;
  params: Record<string, unknown>;
  result?: { success: boolean; task?: { id: string; title: string; [key: string]: unknown }; goal?: { id: string; title: string; [key: string]: unknown } };
}

const actionConfig: Record<string, { label: string; icon: string }> = {
  update_task_deadline: { label: "Moved deadline", icon: "calendar" },
  create_task: { label: "Created task", icon: "plus" },
  update_task_status: { label: "Updated status", icon: "check" },
  update_task_priority: { label: "Changed priority", icon: "arrow" },
  create_goal: { label: "Created goal", icon: "target" },
  delete_task: { label: "Deleted task", icon: "trash" },
};

function ActionIcon({ type, success }: { type: string; success: boolean }) {
  if (type === "calendar") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    );
  }
  if (type === "plus") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    );
  }
  if (type === "target") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    );
  }
  return success ? (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ) : (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function getActionDetail(action: ActionResult): string | null {
  const { action: actionType, params } = action;
  const result = action.result;

  if (actionType === "create_task" && result?.task) {
    return `Task: "${result.task.title}"`;
  }
  if (actionType === "create_goal" && result?.goal) {
    return `Goal: "${result.goal.title}"`;
  }
  if (actionType === "update_task_deadline" && params.new_deadline) {
    return `New deadline: ${params.new_deadline}`;
  }
  if (actionType === "update_task_status" && params.new_status) {
    return `New status: ${params.new_status}`;
  }
  if (actionType === "update_task_priority" && params.new_priority) {
    return `New priority: P${params.new_priority}`;
  }
  return null;
}

export function ActionCard({ action }: { action: ActionResult }) {
  const success = action.result?.success ?? false;
  const config = actionConfig[action.action] ?? { label: action.action.replace(/_/g, " "), icon: "check" };
  const detail = getActionDetail(action);

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      success
        ? "bg-green-50 border-green-200"
        : "bg-red-50 border-red-200"
    }`}>
      <div className="flex items-center gap-2">
        <div className={`shrink-0 ${success ? "text-green-600" : "text-red-600"}`}>
          <ActionIcon type={config.icon} success={success} />
        </div>
        <span className={`text-sm font-medium ${success ? "text-green-700" : "text-red-700"}`}>
          {success ? config.label : `${config.label} failed`}
        </span>
      </div>
      {detail && (
        <p className="text-xs text-muted-foreground mt-1 ml-6">
          {detail}
        </p>
      )}
    </div>
  );
}
