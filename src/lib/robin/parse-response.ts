export interface TaskRecommendation {
  rank: number;
  title: string;
  task_id?: string;
  priority: number;
  deadline?: string;
  why: string;
  is_overdue?: boolean;
  source?: string;
}

export interface ParsedRobinResponse {
  cleanText: string;
  recommendations: TaskRecommendation[];
  action: { action: string; params: Record<string, unknown> } | null;
  summary: string;
  tips: string[];
}

export function parseRobinResponse(content: string): ParsedRobinResponse {
  let cleanText = content;
  let recommendations: TaskRecommendation[] = [];
  let summary = "";
  let tips: string[] = [];

  const structMatch = content.match(/<!--RECOMMENDATIONS\s*\n?([\s\S]*?)-->/);
  if (structMatch) {
    try {
      const parsed = JSON.parse(structMatch[1]);
      recommendations = parsed.recommendations ?? [];
      summary = parsed.summary ?? "";
      tips = parsed.tips ?? [];
    } catch { /* ignore parse errors */ }
    cleanText = content.replace(/<!--RECOMMENDATIONS\s*\n?[\s\S]*?-->/, "").trim();
  }

  cleanText = cleanText.replace(/\{"action":\s*"[^"]+",\s*"params":\s*\{[\s\S]*?\}\}/g, "").trim();

  const action = extractAction(content);

  return { cleanText, recommendations, action, summary, tips };
}

export function extractAction(content: string): { action: string; params: Record<string, unknown> } | null {
  const actionMatch = content.match(/\{"action":\s*"[^"]+",\s*"params":\s*\{[^}]+\}\}/);
  if (!actionMatch) return null;
  try {
    const parsed = JSON.parse(actionMatch[0]);
    if (parsed.action && parsed.params) return { action: parsed.action, params: parsed.params };
  } catch { /* ignore */ }
  return null;
}
