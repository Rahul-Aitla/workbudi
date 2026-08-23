import { createClient } from "@/lib/supabase/server";
import { extractTaskFromEmail } from "@/lib/gemini";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email_ids } = await request.json();

  // Fetch emails to process
  let emailsQuery = supabase
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .eq("processed", false);

  if (email_ids && email_ids.length > 0) {
    emailsQuery = emailsQuery.in("id", email_ids);
  }

  const { data: emails, error: fetchError } = await emailsQuery
    .order("received_at", { ascending: true })
    .limit(5);

  if (fetchError || !emails) {
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }

  const results = [];

  for (const email of emails) {
    try {
      // Check if this email belongs to a thread with an existing task
      let threadContext: { original_task_title: string; original_deadline: string | null; original_priority: number } | undefined;

      if (email.thread_id) {
        console.log(`[AI] Email belongs to thread: ${email.thread_id}`);

        // Check if this email is actually a reply (has In-Reply-To header)
        const isReply = !!email.in_reply_to;

        // Also check if this email's subject starts with "Re:" — strong reply signal
        const isReSubject = email.subject?.toLowerCase().startsWith("re:");

        if (!isReply && !isReSubject) {
          console.log(`[AI] Thread exists but email is NOT a reply (no In-Reply-To, subject doesn't start with Re:). Treating as new email.`);
        } else {
          // Find other emails in the same thread that are linked to a task
          const { data: threadEmails } = await supabase
            .from("emails")
            .select("id, subject, from_address")
            .eq("user_id", user.id)
            .eq("thread_id", email.thread_id)
            .neq("id", email.id);

          if (threadEmails && threadEmails.length > 0) {
            // Find a task linked to any email in this thread
            for (const threadEmail of threadEmails) {
              const { data: linkedTask } = await supabase
                .from("tasks")
                .select("id, title, deadline, priority, status")
                .eq("user_id", user.id)
                .eq("email_id", threadEmail.id)
                .single();

              if (linkedTask && linkedTask.status !== "done") {
                console.log(`[AI] Found thread task: ${linkedTask.id} - "${linkedTask.title}" (from thread email: "${threadEmail.subject}")`);
                threadContext = {
                  original_task_title: linkedTask.title,
                  original_deadline: linkedTask.deadline,
                  original_priority: linkedTask.priority,
                };
                break;
              }
            }
          }
        }
      }

      const extraction = await extractTaskFromEmail(
        email.subject ?? "",
        email.from_address ?? "",
        email.body ?? email.snippet ?? "",
        threadContext
      );

      console.log(`[AI] From: ${email.from_address}`);
      console.log(`[AI] Subject: ${email.subject}`);
      console.log(`[AI] Is followup: ${extraction.is_followup}`);
      console.log(`[AI] Followup changes:`, JSON.stringify(extraction.followup_changes));
      console.log(`[AI] Result -> action_required: ${extraction.action_required}, title: "${extraction.task_title}", priority: ${extraction.priority}, deadline: ${extraction.deadline}`);

      // HANDLE FOLLOW-UP UPDATES (priority: highest — check this first)
      if (extraction.is_followup && threadContext && extraction.followup_changes) {
        console.log(`[AI] ENTERING FOLLOWUP BRANCH`);
        const changes = extraction.followup_changes;
        const updateData: Record<string, unknown> = {};

        // Always update description with new context if available
        if (extraction.context && extraction.context.length > 5) {
          updateData.description = extraction.context;
          console.log(`[AI] Followup: description updated`);
        }

        if (extraction.task_title && extraction.task_title !== threadContext.original_task_title) {
          updateData.title = extraction.task_title;
          console.log(`[AI] Followup: title changed to "${extraction.task_title}"`);
        }

        if (changes.deadline_changed && changes.new_deadline) {
          updateData.deadline = changes.new_deadline;
          console.log(`[AI] Followup: deadline changed to ${changes.new_deadline}`);
        }
        if (changes.priority_changed && changes.new_priority) {
          updateData.priority = changes.new_priority;
          console.log(`[AI] Followup: priority changed to ${changes.new_priority}`);
        }
        if (changes.status_changed && changes.new_status) {
          updateData.status = changes.new_status;
          console.log(`[AI] Followup: status changed to ${changes.new_status}`);
        }

        if (Object.keys(updateData).length > 0 && email.thread_id) {
          const { data: threadEmails } = await supabase
            .from("emails")
            .select("id")
            .eq("user_id", user.id)
            .eq("thread_id", email.thread_id)
            .neq("id", email.id);

          if (threadEmails && threadEmails.length > 0) {
            const threadEmailIds = threadEmails.map((e) => e.id);
            console.log(`[AI] Updating task via thread emails:`, threadEmailIds);
            const { error: updateError } = await supabase
              .from("tasks")
              .update({ ...updateData, updated_at: new Date().toISOString() })
              .eq("user_id", user.id)
              .in("email_id", threadEmailIds)
              .neq("status", "done");
            if (updateError) {
              console.error(`[AI] Task update error:`, updateError);
            } else {
              console.log(`[AI] Task updated successfully:`, updateData);
            }
          }

          results.push({
            email_id: email.id,
            subject: email.subject,
            extraction,
            task_updated: true,
            followup_changes: changes,
          });
        } else {
          console.log(`[AI] Followup detected but no actionable changes`);
          results.push({
            email_id: email.id,
            subject: email.subject,
            extraction,
            followup_changes: null,
            note: "Followup email but no task changes detected",
          });
        }
      }
      // HANDLE NEW TASKS (only if not a follow-up)
      else if (extraction.action_required && extraction.task_title) {
          // Original: check for duplicate tasks — but only if same sender
          const { data: existingTasks } = await supabase
            .from("tasks")
            .select("id, title, priority, deadline, email_id")
            .eq("user_id", user.id)
            .neq("status", "done");

          let linkedTaskId: string | null = null;

          if (existingTasks) {
            for (const task of existingTasks) {
              // Only match if sender is the same (via linked email)
              let sameSender = false;
              if (task.email_id) {
                const { data: taskEmail } = await supabase
                  .from("emails")
                  .select("from_address")
                  .eq("id", task.email_id)
                  .single();
                sameSender = taskEmail?.from_address === email.from_address;
              }

              const titleSim = calculateSimilarity(task.title, extraction.task_title);
              if (titleSim > 0.7 && sameSender) {
                console.log(`[AI] Found duplicate, updating task: ${task.id}`);
                const newPriority = Math.max(task.priority, extraction.priority);
                const updateData: Record<string, unknown> = { priority: newPriority };

                if (extraction.deadline && (!task.deadline || new Date(extraction.deadline) < new Date(task.deadline))) {
                  updateData.deadline = extraction.deadline;
                }

                await supabase
                  .from("tasks")
                  .update(updateData)
                  .eq("id", task.id);

                linkedTaskId = task.id;
                break;
              }
            }
          }

          if (!linkedTaskId) {
            console.log(`[AI] Creating new task: "${extraction.task_title}"`);
            const { data: newTask, error: insertError } = await supabase
              .from("tasks")
              .insert({
                user_id: user.id,
                title: extraction.task_title,
                description: extraction.context,
                priority: extraction.priority,
                deadline: extraction.deadline,
                status: extraction.suggested_status,
                source: "email",
                email_id: email.id,
              })
              .select("id")
              .single();

            if (insertError) {
              console.error("[AI] Task insert error:", insertError);
            } else {
              console.log(`[AI] Created task: ${newTask?.id}`);
              linkedTaskId = newTask?.id ?? null;
            }
          }

          results.push({
            email_id: email.id,
            subject: email.subject,
            extraction,
            task_created: !linkedTaskId,
            task_updated: !!linkedTaskId,
          });
        }

      // Mark email as processed (only if AI didn't fail)
      if (extraction.ai_failed) {
        console.log(`[AI] Email ${email.id} AI failed — will retry later`);
      } else {
        await supabase
          .from("emails")
          .update({ processed: true })
          .eq("id", email.id);
      }

    } catch (error) {
      console.error(`[AI Understand] Error processing email ${email.id}:`, error);
    }
  }

  // Count remaining unprocessed emails
  const { count: remaining } = await supabase
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("processed", false);

  return NextResponse.json({
    processed: emails.length,
    remaining: remaining ?? 0,
    results,
  });
}

function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.9;
  }

  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w));
  const union = new Set([...aWords, ...bWords]);

  return intersection.length / union.size;
}
