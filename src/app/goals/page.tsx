import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { GoalsList } from "@/components/goals/goals-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("status")
    .eq("user_id", user.id);

  const totalTasks = tasks?.length ?? 0;
  const doneTasks = tasks?.filter((t) => t.status === "done").length ?? 0;
  const inProgressTasks = tasks?.filter((t) => t.status === "in_progress").length ?? 0;
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Goals</h1>
              <p className="text-muted-foreground">
                Define what you want to achieve. Robin uses these to prioritize your work.
              </p>
            </div>
          </div>

          {totalTasks > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Overall Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{completionPct}%</span>
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>{doneTasks} done</span>
                  <span>{inProgressTasks} in progress</span>
                  <span>{totalTasks - doneTasks - inProgressTasks} todo</span>
                  <span>{totalTasks} total</span>
                </div>
              </CardContent>
            </Card>
          )}

          <GoalsList initialGoals={goals ?? []} userId={user.id} />
        </div>
      </main>
    </div>
  );
}
