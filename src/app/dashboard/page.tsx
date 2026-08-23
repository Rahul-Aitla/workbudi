import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { EmailsList } from "@/components/emails/emails-list";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [goalsResult, tasksResult, emailsResult] = await Promise.all([
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("tasks").select("id, status, deadline", { count: "exact" }).eq("user_id", user.id),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const totalTasks = tasksResult.count ?? 0;
  const doneTasks = tasksResult.data?.filter((t) => t.status === "done").length ?? 0;
  const pendingTasks = totalTasks - doneTasks;
  const today = new Date().toISOString().split("T")[0];
  const dueSoonTasks = tasksResult.data?.filter(
    (t) => t.deadline && t.status !== "done" && t.deadline <= today
  ).length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back, {user.user_metadata?.full_name?.split(" ")[0] ?? user.email?.split("@")[0]}
            </h1>
            <p className="text-muted-foreground text-sm">
              Here&apos;s your work overview for today.
            </p>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Goals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{goalsResult.count ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {goalsResult.count === 0 ? "No goals set" : "active"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pendingTasks}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dueSoonTasks > 0 ? (
                    <span className="text-amber-600">{dueSoonTasks} due soon</span>
                  ) : "all on track"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Emails Synced</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{emailsResult.count ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {emailsResult.count === 0 ? "No emails yet" : "total synced"}
                </p>
              </CardContent>
            </Card>
          </div>

          <EmailsList userId={user.id} />

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <a
                  href="/goals"
                  className="flex items-center justify-between p-2 -mx-2 rounded-md text-sm hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">+</span> Add a goal
                  </span>
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
                <a
                  href="/tasks"
                  className="flex items-center justify-between p-2 -mx-2 rounded-md text-sm hover:bg-muted transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">+</span> Create a task
                  </span>
                  <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
                <a
                  href="/robin"
                  className="flex items-center justify-between p-2 -mx-2 rounded-md text-sm font-medium bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-primary">*</span> Ask Robin what to work on
                  </span>
                  <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </a>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Getting Started</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${(goalsResult.count ?? 0) > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {(goalsResult.count ?? 0) > 0 ? "\u2713" : "1"}
                  </span>
                  <span className={(goalsResult.count ?? 0) > 0 ? "text-muted-foreground line-through" : ""}>Set your goals</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${(emailsResult.count ?? 0) > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {(emailsResult.count ?? 0) > 0 ? "\u2713" : "2"}
                  </span>
                  <span className={(emailsResult.count ?? 0) > 0 ? "text-muted-foreground line-through" : ""}>Connect Gmail</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${totalTasks > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {totalTasks > 0 ? "\u2713" : "3"}
                  </span>
                  <span className={totalTasks > 0 ? "text-muted-foreground line-through" : ""}>Create tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs bg-muted text-muted-foreground">4</span>
                  <span>Ask Robin what to work on</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
