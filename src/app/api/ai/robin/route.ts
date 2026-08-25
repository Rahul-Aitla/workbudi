import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RobinContext {
  today: string;
  goals: { title: string; description: string | null }[];
  tasks: {
    id: string;
    title: string;
    priority: number;
    deadline: string | null;
    status: string;
    source: string;
  }[];
  recentEmails: {
    subject: string | null;
    from_name: string | null;
    received_at: string | null;
  }[];
  pendingClarifications: {
    subject: string | null;
    clarification_question: string | null;
  }[];
}

async function loadContext(userId: string): Promise<RobinContext> {
  const { createClient: createServerClient } = await import(
    "@/lib/supabase/server"
  );
  const supabase = await createServerClient();

  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [goalsResult, tasksResult, emailsResult, clarificationsResult] = await Promise.all([
    supabase
      .from("goals")
      .select("title, description")
      .eq("user_id", userId),
    supabase
      .from("tasks")
      .select("id, title, priority, deadline, status, source")
      .eq("user_id", userId)
      .neq("status", "done"),
    supabase
      .from("emails")
      .select("subject, from_name, received_at")
      .eq("user_id", userId)
      .gte("received_at", sevenDaysAgo)
      .order("received_at", { ascending: false })
      .limit(20),
    supabase
      .from("emails")
      .select("subject, clarification_question")
      .eq("user_id", userId)
      .eq("processing_status", "needs_clarification"),
  ]);

  return {
    today: new Date().toISOString().split("T")[0],
    goals: goalsResult.data ?? [],
    tasks: tasksResult.data ?? [],
    recentEmails: emailsResult.data ?? [],
    pendingClarifications: clarificationsResult.data ?? [],
  };
}

function buildSystemPrompt(context: RobinContext): string {
  const goalsText =
    context.goals.length > 0
      ? context.goals
          .map((g) => `- ${g.title}: ${g.description || "No description"}`)
          .join("\n")
      : "No goals set yet.";

  const tasksText =
    context.tasks.length > 0
      ? context.tasks
          .map(
            (t) =>
              `- [P${t.priority}] ${t.title} | Due: ${t.deadline || "None"} | Status: ${t.status} | Source: ${t.source} | ID: ${t.id}`
          )
          .join("\n")
      : "No active tasks.";

  const emailsText =
    context.recentEmails.length > 0
      ? context.recentEmails
          .map(
            (e) =>
              `- From: ${e.from_name || "Unknown"} | Subject: ${e.subject || "No subject"} | Date: ${e.received_at || "Unknown"}`
          )
          .join("\n")
      : "No recent emails.";

  const overdueTasks = context.tasks.filter(
    (t) => t.deadline && t.deadline < context.today && t.status !== "done"
  );
  const overdueText =
    overdueTasks.length > 0
      ? `\nOVERDUE TASKS (deadline < ${context.today}):\n${overdueTasks.map((t) => `- [P${t.priority}] ${t.title} (due: ${t.deadline})`).join("\n")}`
      : "";

  return `You are Robin, a work prioritization assistant for WorkBudi. Today's date: ${context.today}

========================================
GOALS vs TASKS — HOW TO TELL THEM APART
========================================

GOALS are high-level outcomes the user wants to achieve. They have NO deadline, NO priority, and NO status.
Examples: "Improve productivity", "Get a new job", "Learn TypeScript", "Ship MVP by end of quarter"
When a user says things like "I want to...", "My goal is...", "I'm trying to...", "I want to get better at..." → they mean a GOAL.

TASKS are specific actionable work items with deadlines, priorities, and status (todo/in_progress/done).
Examples: "Reply to Khushal's email", "Review proposal", "Write README", "Deploy to Vercel"
When a user says things like "I need to...", "Remind me to...", "Create a task for...", "Send the..." → they mean a TASK.

RULES:
- If the user describes a broad outcome or aspiration → create a GOAL
- If the user describes a specific action with a deadline or deliverable → create a TASK
- Tasks should align with goals. When prioritizing, tasks that advance a goal get higher priority.
- If unsure, ask: "Is this a goal (long-term outcome) or a task (specific action)?"

========================================
CONTEXT
========================================

USER'S GOALS:
${goalsText}

ACTIVE TASKS (not done):
${tasksText}${overdueText}

RECENT EMAILS (last 7 days):
${emailsText}

PENDING CLARIFICATIONS:
${context.pendingClarifications.length > 0
  ? context.pendingClarifications.map((c) => `- "${c.subject || "Untitled"}" — ${c.clarification_question || "Needs more context"}`).join("\n")
  : "None"}

========================================
CAPABILITIES
========================================

- Recommend what to work on today based on deadlines, priorities, goals, and email context
- Explain WHY each task is prioritized (link to goals when relevant)
- Create new tasks when the user asks
- Create new goals when the user describes an outcome
- Move task deadlines when requested
- Change task status when asked
- Change task priority when asked

========================================
OUTPUT FORMAT
========================================

After your natural language response, ALWAYS append a structured data block on a new line:

<!--RECOMMENDATIONS
{"recommendations": [{"rank": 1, "title": "task title", "task_id": "uuid or null", "priority": 1-5, "deadline": "YYYY-MM-DD or null", "why": "short reason", "is_overdue": false, "source": "email or manual"}, ...], "summary": "one line summary", "tips": ["tip1", "tip2"]}
-->

This block MUST be on its own line starting with <!--RECOMMENDATIONS and ending with -->.

When the user asks to perform an action (move deadline, create task, create goal, change status), you MUST include the action JSON. Do NOT just describe the action in text — the system needs the JSON to actually execute it:
{"action": "action_name", "params": { ... }}

CRITICAL: If you say "I've created a task" or "Goal created" without the action JSON, nothing actually happens. The JSON is what triggers the real action.

Available actions:
- update_task_deadline: {"action": "update_task_deadline", "params": {"task_id": "uuid", "new_deadline": "YYYY-MM-DD"}}
- create_task: {"action": "create_task", "params": {"title": "string", "priority": 1-5, "deadline": "YYYY-MM-DD or null", "description": "string"}}
- update_task_status: {"action": "update_task_status", "params": {"task_id": "uuid", "new_status": "todo/in_progress/done"}}
- update_task_priority: {"action": "update_task_priority", "params": {"task_id": "uuid", "new_priority": 1-5}}
- create_goal: {"action": "create_goal", "params": {"title": "string", "description": "optional description"}}

========================================
RULES
========================================

- Keep your natural language response SHORT (2-3 sentences max) — the UI shows structured cards separately
- Be direct and actionable, not verbose
- If overdue tasks exist, mention them first
- When recommending tasks, explain how they relate to the user's goals
- When performing an action (create task/goal, update deadline/status/priority), ALWAYS include the action JSON — never just describe it in words`;
}

async function chatWithGroq(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
    model: "openai/gpt-oss-20b",
    temperature: 0.3,
    max_tokens: 2000,
  });

  return completion.choices[0]?.message?.content ?? "";
}

async function chatWithGemini(
  systemPrompt: string,
  messages: ChatMessage[]
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    systemInstruction: systemPrompt,
  });

  const chat = model.startChat({
    history: messages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const context = await loadContext(user.id);
    const systemPrompt = buildSystemPrompt(context);

    const initMessage: ChatMessage = {
      role: "user",
      content: "What should I work on today? Give me your top recommendations.",
    };

    let response: string;
    try {
      response = await chatWithGroq(systemPrompt, [initMessage]);
      console.log("[Robin GET] Used Groq");
    } catch (groqError) {
      console.warn("[Robin GET] Groq failed, falling back to Gemini:", groqError);
      response = await chatWithGemini(systemPrompt, [initMessage]);
      console.log("[Robin GET] Used Gemini");
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error("[Robin GET] All LLM providers failed:", error);
    return NextResponse.json(
      { error: "Robin is unavailable right now." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = (await request.json()) as { messages: ChatMessage[] };

  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages array required" },
      { status: 400 }
    );
  }

  try {
    const context = await loadContext(user.id);
    const systemPrompt = buildSystemPrompt(context);

    let response: string;
    try {
      response = await chatWithGroq(systemPrompt, messages);
      console.log("[Robin] Used Groq");
    } catch (groqError) {
      console.warn("[Robin] Groq failed, falling back to Gemini:", groqError);
      response = await chatWithGemini(systemPrompt, messages);
      console.log("[Robin] Used Gemini");
    }

    return NextResponse.json({ response });
  } catch (error) {
    console.error("[Robin] All LLM providers failed:", error);
    return NextResponse.json(
      { error: "Robin is unavailable right now. Please try again." },
      { status: 500 }
    );
  }
}
