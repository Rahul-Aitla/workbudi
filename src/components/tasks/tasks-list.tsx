"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { TaskCard } from "./task-card";
import { TaskForm } from "./task-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    if (editingTask) {
      const { data } = await supabase
        .from("tasks")
        .update({ ...taskData, updated_at: new Date().toISOString() })
        .eq("id", editingTask.id)
        .select()
        .single();
      if (data) setTasks(tasks.map((t) => (t.id === data.id ? data : t)));
    } else {
      const { data } = await supabase
        .from("tasks")
        .insert({ ...taskData, user_id: userId })
        .select()
        .single();
      if (data) setTasks([data, ...tasks]);
    }
    setShowForm(false);
    setEditingTask(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    setTasks(tasks.filter((t) => t.id !== id));
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
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No tasks {filter !== "all" ? `with status "${filter}"` : "yet"}</p>
          <p className="text-sm">Create your first task to get started.</p>
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
