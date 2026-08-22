import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { GoalsList } from "@/components/goals/goals-list";

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

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
          <GoalsList initialGoals={goals ?? []} userId={user.id} />
        </div>
      </main>
    </div>
  );
}
