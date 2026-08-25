import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

interface EmailExtraction {
  action_required: boolean;
  needs_clarification: boolean;
  task_title: string;
  deadline: string | null;
  priority: number;
  context: string;
  clarification_question: string;
  suggested_status: "todo" | "in_progress";
  ai_failed: boolean;
  is_followup: boolean;
  followup_changes: {
    deadline_changed: boolean;
    priority_changed: boolean;
    status_changed: boolean;
    new_deadline: string | null;
    new_priority: number | null;
    new_status: string | null;
    change_summary: string;
  } | null;
}

const extractionPrompt = `You are a strict email task filter. Only extract tasks from emails that clearly require PERSONAL ACTION.

ALWAYS action_required=false for: job alerts, newsletters, marketing, system notifications, LinkedIn invitations, noreply addresses.

ALWAYS action_required=true ONLY for: a real person asking you to do something, emails with a clear deadline, direct requests from colleagues/clients.

CRITICAL RULES for needs_clarification:
Set needs_clarification=true and action_required=false when ANY of these are true:
- The email has NO deadline and NO specific deliverable (e.g. "Can you take a look at this?", "Let me know what you think", "Check this out")
- The task is vague with no clear end state (what does "done" look like?)
- The email is ambiguous about what action to take
When needs_clarification=true, generate a clarification_question that asks WHAT specifically needs to be done and WHEN it's needed. Be specific — don't just ask "What do you want?" — reference the email content.

For example:
- "Can you take a look at this?" → clarification_question: "What would you like me to do with the investor proposal, and when do you need it by?"
- "Review the ML assignment" (no deadline) → clarification_question: "When do you need the ML assignment review completed by?"
- "Fix the bug in production" (clear action, no deadline) → needs_clarification=true, clarification_question: "When does this need to be fixed by?"

IMPORTANT: Today is {today}. The current year is {year}. When extracting a deadline, ALWAYS use the current year ({year}) unless the email explicitly states a different year. If the email says "Monday" or "next week", calculate the actual date based on today ({today}).

Return ONLY this JSON, nothing else:
{"action_required":true/false,"needs_clarification":false,"task_title":"what to do or empty","deadline":"YYYY-MM-DD or null","priority":1-5,"context":"brief summary","clarification_question":"specific question about what to do and when — only when needs_clarification=true","suggested_status":"todo or in_progress","is_followup":false,"followup_changes":null}

Email from: {from}
Subject: {subject}
Body: {body}`;

const followupExtractionPrompt = `You are analyzing a REPLY email. This reply is about an existing task.

TASK: {original_task_title}
CURRENT DEADLINE: {original_deadline}
CURRENT PRIORITY: {original_priority}
TODAY: {today}

EMAIL FROM: {from}
SUBJECT: {subject}
BODY: {body}

Detect if this reply changes the task. Look for:
- New deadline ("make it Monday", "pushed to Aug 31")
- New priority ("urgent now", "low priority")
- New requirements ("also need", "I also want", "additionally")
- Status change ("done", "cancel this")

Return JSON only:
{"action_required":true,"needs_clarification":false,"task_title":"what changed","deadline":"new date or null","priority":3,"context":"what changed","suggested_status":"todo","is_followup":true,"followup_changes":{"deadline_changed":false,"priority_changed":false,"status_changed":false,"new_deadline":null,"new_priority":null,"new_status":null,"change_summary":"what changed"}}

If this reply has NO changes (just "thanks", "ok", "got it"), return:
{"action_required":false,"needs_clarification":false,"task_title":"","deadline":null,"priority":1,"context":"no changes","suggested_status":"todo","is_followup":true,"followup_changes":null}`;

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

function extractJson(text: string): string | null {
  // Find first { and count braces to find matching }
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const json = text.slice(start, i + 1);
        console.log(`[JSON] Extracted ${json.length} chars, starts: ${json.slice(0, 80)}...`);
        return json;
      }
    }
  }
  console.log(`[JSON] Failed to find matching brace. depth=${depth}, text length=${text.length}`);
  return null;
}

function normalizeDeadline(deadline: string | null): string | null {
  if (!deadline) return null;

  // Try to parse the date
  const parsed = new Date(deadline);
  if (isNaN(parsed.getTime())) return null;

  const now = new Date();
  const currentYear = now.getFullYear();

  // If the year is more than 1 year in the past, fix it to current year
  if (parsed.getFullYear() < currentYear - 1) {
    parsed.setFullYear(currentYear);
    console.log(`[Date] Fixed year from ${deadline} to ${parsed.toISOString().split("T")[0]}`);
  }

  // If the date is more than 2 years in the future, it's probably wrong
  if (parsed.getFullYear() > currentYear + 2) {
    parsed.setFullYear(currentYear);
    console.log(`[Date] Fixed future year from ${deadline} to ${parsed.toISOString().split("T")[0]}`);
  }

  return parsed.toISOString().split("T")[0];
}

function parseExtraction(text: string): EmailExtraction {
  const cleaned = stripThinking(text);
  console.log("[LLM] Cleaned response:", cleaned.slice(0, 300));

  const jsonStr = extractJson(cleaned);
  if (!jsonStr) {
    return {
      action_required: false,
      needs_clarification: false,
      task_title: "",
      deadline: null,
      priority: 1,
      context: "Could not parse",
      clarification_question: "",
      suggested_status: "todo",
      ai_failed: true,
      is_followup: false,
      followup_changes: null,
    };
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      action_required: Boolean(parsed.action_required),
      needs_clarification: Boolean(parsed.needs_clarification),
      task_title: String(parsed.task_title || "").slice(0, 100),
      deadline: normalizeDeadline(parsed.deadline),
      priority: Math.min(5, Math.max(1, Number(parsed.priority) || 1)),
      context: String(parsed.context || "").slice(0, 500),
      clarification_question: String(parsed.clarification_question || "").slice(0, 500),
      suggested_status: ["todo", "in_progress"].includes(parsed.suggested_status)
        ? parsed.suggested_status
        : "todo",
      ai_failed: false,
      is_followup: Boolean(parsed.is_followup),
      followup_changes: parsed.followup_changes || null,
    };
  } catch {
    return {
      action_required: false,
      needs_clarification: false,
      task_title: "",
      deadline: null,
      priority: 1,
      context: "JSON parse failed",
      clarification_question: "",
      suggested_status: "todo",
      ai_failed: true,
      is_followup: false,
      followup_changes: null,
    };
  }
}

async function extractWithGroq(
  subject: string,
  from: string,
  body: string,
  threadContext?: { original_task_title: string; original_deadline: string | null; original_priority: number }
): Promise<EmailExtraction> {
  const isFollowup = !!threadContext;
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear().toString();
  const prompt = isFollowup
    ? followupExtractionPrompt
        .replace(/{today}/g, today)
        .replace(/{year}/g, year)
        .replace("{original_task_title}", threadContext.original_task_title)
        .replace("{original_deadline}", threadContext.original_deadline || "None")
        .replace("{original_priority}", String(threadContext.original_priority))
        .replace("{from}", from)
        .replace("{subject}", subject)
        .replace("{body}", body.slice(0, 3000))
    : extractionPrompt
        .replace(/{today}/g, today)
        .replace(/{year}/g, year)
        .replace("{from}", from)
        .replace("{subject}", subject)
        .replace("{body}", body.slice(0, 3000));

  console.log(`[Groq] Sending ${isFollowup ? "followup" : "new"} prompt (${prompt.length} chars)`);

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
    max_tokens: 1000,
  });

  const text = completion.choices[0]?.message?.content ?? "";
  console.log(`[Groq] Raw response (${text.length} chars): ${text.slice(0, 200)}`);

  if (!text || text.trim().length === 0) {
    console.warn("[Groq] Empty response, throwing to fallback");
    throw new Error("Empty Groq response");
  }

  return parseExtraction(text);
}

async function extractWithGemini(
  subject: string,
  from: string,
  body: string,
  threadContext?: { original_task_title: string; original_deadline: string | null; original_priority: number }
): Promise<EmailExtraction> {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

  const isFollowup = !!threadContext;
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear().toString();
  const prompt = isFollowup
    ? followupExtractionPrompt
        .replace(/{today}/g, today)
        .replace(/{year}/g, year)
        .replace("{original_task_title}", threadContext.original_task_title)
        .replace("{original_deadline}", threadContext.original_deadline || "None")
        .replace("{original_priority}", String(threadContext.original_priority))
        .replace("{from}", from)
        .replace("{subject}", subject)
        .replace("{body}", body.slice(0, 3000))
    : extractionPrompt
        .replace(/{today}/g, today)
        .replace(/{year}/g, year)
        .replace("{from}", from)
        .replace("{subject}", subject)
        .replace("{body}", body.slice(0, 3000));

  console.log(`[Gemini] Sending ${isFollowup ? "followup" : "new"} prompt (${prompt.length} chars)`);

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  console.log(`[Gemini] Raw response (${text.length} chars): ${text.slice(0, 200)}`);

  return parseExtraction(text);
}

export async function extractTaskFromEmail(
  subject: string,
  from: string,
  body: string,
  threadContext?: { original_task_title: string; original_deadline: string | null; original_priority: number }
): Promise<EmailExtraction> {
  // Follow-ups → Gemini only (Groq returns empty for complex followup prompts)
  if (threadContext) {
    try {
      const result = await extractWithGemini(subject, from, body, threadContext);
      console.log("[LLM] Used Gemini (followup)");
      return result;
    } catch (error) {
      console.error("[LLM] Gemini followup failed:", error);
    }
  }

  // New emails → Groq primary, Gemini fallback
  try {
    const result = await extractWithGroq(subject, from, body);
    console.log("[LLM] Used Groq (new)");
    return result;
  } catch (error) {
    console.warn("[LLM] Groq failed:", error);
  }

  try {
    const result = await extractWithGemini(subject, from, body);
    console.log("[LLM] Used Gemini (new, fallback)");
    return result;
  } catch (error) {
    console.error("[LLM] Gemini failed:", error);
  }

  return {
    action_required: false,
    needs_clarification: false,
    task_title: "",
    deadline: null,
    priority: 1,
    context: "AI failed",
    clarification_question: "",
    suggested_status: "todo",
    ai_failed: true,
    is_followup: false,
    followup_changes: null,
  };
}

export function calculateSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.9;

  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));
  const intersection = [...aWords].filter((w) => bWords.has(w));
  const union = new Set([...aWords, ...bWords]);

  return intersection.length / union.size;
}

const clarificationExtractionPrompt = `You are extracting task details from a user's clarification answer.

Original email subject: {subject}
Clarification question asked: {clarification_question}
User's answer: {user_answer}

Extract a clean task title, deadline, priority, and description from the user's answer.
If the user mentions a date, calculate it based on today ({today}).
Priority: 1=Low, 2=Medium-Low, 3=Medium, 4=High, 5=Critical. Default to 3 if not mentioned.

Return ONLY this JSON:
{"task_title":"clean task title","deadline":"YYYY-MM-DD or null","priority":1-5,"description":"what the user wants to do"}`;

export async function extractFromClarification(
  subject: string,
  clarificationQuestion: string,
  userAnswer: string,
): Promise<{ task_title: string; deadline: string | null; priority: number; description: string }> {
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear();
  const prompt = clarificationExtractionPrompt
    .replace("{subject}", subject)
    .replace("{clarification_question}", clarificationQuestion)
    .replace("{user_answer}", userAnswer)
    .replace("{today}", today)
    .replace("{today}", today)
    .replace("{year}", String(year));

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const cleaned = stripThinking(content);
    const jsonStr = extractJson(cleaned);

    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      return {
        task_title: String(parsed.task_title || subject || "Untitled task").slice(0, 100),
        deadline: normalizeDeadline(parsed.deadline),
        priority: Math.min(5, Math.max(1, Number(parsed.priority) || 3)),
        description: String(parsed.description || userAnswer).slice(0, 500),
      };
    }
  } catch (error) {
    console.error("[Clarify] LLM extraction failed, using simple extraction:", error);
  }

  // Fallback: simple extraction without LLM
  return {
    task_title: subject || "Untitled task",
    deadline: null,
    priority: 3,
    description: userAnswer,
  };
}
