"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { TaskCard } from "./task-card";
import { TaskForm } from "./task-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import type { Task, Email } from "@/types/database";

interface TasksListProps {
  initialTasks: Task[];
  userId: string;
}

export function TasksList({ initialTasks, userId }: TasksListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [emails, setEmails] = useState<Record<string, Email>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<"all" | "todo" | "in_progress" | "done">("all");
  const supabase = createClient();

  const filteredTasks = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  // Fetch linked emails for email-sourced tasks
  useEffect(() => {
    const fetchLinkedEmails = async () => {
      const emailTaskIds = tasks
        .filter((t) => t.source === "email" && t.email_id)
        .map((t) => t.email_id!);

      if (emailTaskIds.length === 0) return;

      const { data } = await supabase
        .from("emails")
        .select("*")
        .in("id", emailTaskIds);

      if (data) {
        const emailMap: Record<string, Email> = {};
        data.forEach((email) => {
          emailMap[email.id] = email;
        });
        setEmails(emailMap);
      }
    };

    fetchLinkedEmails();
  }, [tasks, supabase]);

  const handleSave = async (taskData: Omit<Task, "id" | "created_at" | "updated_at" | "user_id">) => {
    try {
      if (editingTask) {
        const { data, error } = await supabase
          .from("tasks")
          .update({ ...taskData, updated_at: new Date().toISOString() })
          .eq("id", editingTask.id)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setTasks(tasks.map((t) => (t.id === data.id ? data : t)));
          toast.add({ type: "success", title: "Task updated", description: `"${data.title}" has been updated` });
        }
      } else {
        const { data, error } = await supabase
          .from("tasks")
          .insert({ ...taskData, user_id: userId })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setTasks([data, ...tasks]);
          toast.add({ type: "success", title: "Task created", description: `"${data.title}" has been created` });
        }
      }
      setShowForm(false);
      setEditingTask(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save task";
      toast.add({ type: "error", title: "Save failed", description: message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
      setTasks(tasks.filter((t) => t.id !== id));
      toast.add({ type: "success", title: "Task deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete task";
      toast.add({ type: "error", title: "Delete failed", description: message });
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "todo", "in_progress", "done"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
              <Badge variant="secondary" className="ml-1">
                {tasks.filter((t) => f === "all" || t.status === f).length}
              </Badge>
            </Button>
          ))}
        </div>
        <Button onClick={() => { setEditingTask(null); setShowForm(true); }}>
          + New Task
        </Button>
      </div>

      {showForm && (
        <TaskForm
          task={editingTask}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingTask(null); }}
        />
      )}

      {filteredTasks.length === 0 && !showForm && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">No tasks {filter !== "all" ? `with status "${filter}"` : "yet"}</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first task or let Robin create one from your emails.</p>
        </div>
      )}

      <div className="space-y-3">
        {filteredTasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            email={task.email_id ? emails[task.email_id] ?? null : null}
            onEdit={() => handleEdit(task)}
            onDelete={() => handleDelete(task.id)}
          />
        ))}
      </div>
    </div>
  );
}
