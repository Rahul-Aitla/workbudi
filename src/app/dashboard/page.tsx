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
    supabase.from("tasks").select("id, status", { count: "exact" }).eq("user_id", user.id),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  const totalTasks = tasksResult.count ?? 0;
  const doneTasks = tasksResult.data?.filter((t) => t.status === "done").length ?? 0;
  const pendingTasks = totalTasks - doneTasks;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold">
            Welcome back, {user.user_metadata?.full_name ?? user.email}
          </h1>
          <p className="text-muted-foreground">
            Here&apos;s your work overview for today.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Goals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{goalsResult.count ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Tasks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{pendingTasks}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Emails Synced
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{emailsResult.count ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          <EmailsList userId={user.id} />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a href="/goals" className="block text-sm text-primary hover:underline">
                  + Add a new goal
                </a>
                <a href="/tasks" className="block text-sm text-primary hover:underline">
                  + Create a task
                </a>
                <a href="/robin" className="block text-sm text-primary hover:underline">
                  Ask Robin what to work on
                </a>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>1. Set your goals so Robin understands what matters</p>
                <p>2. Create tasks with priorities and deadlines</p>
                <p>3. Connect Gmail for auto task creation</p>
                <p>4. Ask Robin: &ldquo;What should I work on today?&rdquo;</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
