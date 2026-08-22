import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface ActionRequest {
  action: string;
  params: Record<string, unknown>;
}

async function updateTaskDeadline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: { task_id: string; new_deadline: string }
) {
  const { data, error } = await supabase
    .from("tasks")
    .update({
      deadline: params.new_deadline,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.task_id)
    .eq("user_id", userId)
    .select("id, title, deadline")
    .single();

  if (error) throw new Error(`Failed to update deadline: ${error.message}`);
  return { success: true, task: data };
}

async function createTask(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: {
    title: string;
    priority?: number;
    deadline?: string | null;
    description?: string;
  }
) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      user_id: userId,
      title: params.title,
      priority: params.priority ?? 3,
      deadline: params.deadline ?? null,
      description: params.description ?? "",
      status: "todo",
      source: "manual",
    })
    .select("id, title, priority, deadline")
    .single();

  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return { success: true, task: data };
}

async function createGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: { title: string; description?: string }
) {
  if (!params.title || params.title.trim().length === 0) {
    throw new Error("Goal title is required");
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      title: params.title.trim(),
      description: params.description ?? null,
    })
    .select("id, title, description")
    .single();

  if (error) throw new Error(`Failed to create goal: ${error.message}`);
  return { success: true, goal: data };
}

async function updateTaskStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  params: { task_id: string; new_status: string }
) {
  if (!["todo", "in_progress", "done"].includes(params.new_status)) {
    throw new Error(
      `Invalid status: ${params.new_status}. Must be todo, in_progress, or done.`
    );
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: params.new_status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.task_id)
    .eq("user_id", userId)
    .select("id, title, status")
    .single();

  if (error) throw new Error(`Failed to update status: ${error.message}`);
  return { success: true, task: data };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, params } = (await request.json()) as ActionRequest;

  try {
    let result;

    switch (action) {
      case "update_task_deadline":
        result = await updateTaskDeadline(supabase, user.id, params as { task_id: string; new_deadline: string });
        break;
      case "create_task":
        result = await createTask(supabase, user.id, params as { title: string; priority?: number; deadline?: string | null; description?: string });
        break;
      case "update_task_status":
        result = await updateTaskStatus(supabase, user.id, params as { task_id: string; new_status: string });
        break;
      case "create_goal":
        result = await createGoal(supabase, user.id, params as { title: string; description?: string });
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
