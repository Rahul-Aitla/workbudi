import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email_id, deadline, priority } = (await request.json()) as {
    email_id: string;
    deadline: string | null;
    priority?: number;
  };

  if (!email_id) {
    return NextResponse.json({ error: "email_id required" }, { status: 400 });
  }

  // Load the email — verify ownership and status
  const { data: email, error: emailError } = await supabase
    .from("emails")
    .select("id, user_id, subject, clarification_question, thread_id, processing_status")
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

  // Use the email subject as task title (the LLM's extracted title was not persisted)
  // The clarification_question contains the AI's explanation of what's missing
  const taskTitle = email.subject || "Untitled task from email";

  // Create the task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      title: taskTitle,
      description: email.clarification_question || null,
      priority: priority ?? 3,
      deadline: deadline || null,
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

  // Clear Robin recommendation cache (client-side will handle this via clearRobinCache)
  // We return a flag so the client knows to clear it
  return NextResponse.json({ task, clear_robin_cache: true });
}
