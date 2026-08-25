import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { extractFromClarification } from "@/lib/gemini";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email_id, deadline, priority, context } = (await request.json()) as {
    email_id: string;
    deadline: string | null;
    priority?: number;
    context?: string;
  };

  if (!email_id) {
    return NextResponse.json({ error: "email_id required" }, { status: 400 });
  }

  // Load the email — verify ownership and status
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("id, user_id, subject, clarification_question, body, thread_id, processing_status")
    .eq("id", email_id)
    .single();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  if (email.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (email.processing_status !== "needs_clarification") {
    return NextResponse.json({ error: "Email does not need clarification" }, { status: 400 });
  }

  let taskTitle: string;
  let taskDeadline: string | null;
  let taskPriority: number;
  let taskDescription: string;

  if (context && context.trim().length > 0) {
    // User provided free-text answer — use LLM to extract structured task details
    const extracted = await extractFromClarification(
      email.subject || "",
      email.clarification_question || "",
      context.trim(),
    );
    taskTitle = extracted.task_title;
    taskDeadline = extracted.deadline || deadline || null;
    taskPriority = extracted.priority;
    taskDescription = extracted.description;
  } else {
    // Simple deadline button click — no LLM call needed
    taskTitle = email.subject || "Untitled task from email";
    taskDeadline = deadline || null;
    taskPriority = priority ?? 3;
    taskDescription = email.clarification_question || null;
  }

  // Create the task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: taskTitle,
      description: taskDescription,
      priority: taskPriority,
      deadline: taskDeadline,
      status: "todo",
      source: "email",
      email_id: email.id,
    })
    .select()
    .single();

  if (taskError) {
    console.error("[Clarify] Failed to create task:", taskError);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }

  // Update email status
  await supabase
    .from("emails")
    .update({ processing_status: "task_created" })
    .eq("id", email.id);

  return NextResponse.json({ task, clear_robin_cache: true });
}
