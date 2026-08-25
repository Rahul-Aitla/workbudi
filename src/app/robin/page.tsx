import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Header } from "@/components/layout/header";
import { ChatInterface } from "@/components/robin/chat-interface";
import { Card, CardContent } from "@/components/ui/card";

export default async function RobinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Robin</h1>
            <p className="text-sm text-muted-foreground">
              AI Work Prioritization Assistant
            </p>
          </div>

          <Card className="h-[calc(100vh-14rem)]">
            <CardContent className="p-0 h-full">
              <ChatInterface />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
