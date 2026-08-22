"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoalCard } from "./goal-card";
import { GoalForm } from "./goal-form";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { Goal } from "@/types/database";

interface GoalsListProps {
  initialGoals: Goal[];
  userId: string;
}

export function GoalsList({ initialGoals, userId }: GoalsListProps) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const supabase = createClient();

  const handleSave = async (title: string, description: string) => {
    try {
      if (editingGoal) {
        const { data, error } = await supabase
          .from("goals")
          .update({ title, description })
          .eq("id", editingGoal.id)
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setGoals(goals.map((g) => (g.id === data.id ? data : g)));
          toast.add({ type: "success", title: "Goal updated", description: `"${data.title}" has been updated` });
        }
      } else {
        const { data, error } = await supabase
          .from("goals")
          .insert({ user_id: userId, title, description })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setGoals([data, ...goals]);
          toast.add({ type: "success", title: "Goal created", description: `"${data.title}" has been created` });
        }
      }
      setShowForm(false);
      setEditingGoal(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save goal";
      toast.add({ type: "error", title: "Save failed", description: message });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("goals").delete().eq("id", id);
      if (error) throw error;
      setGoals(goals.filter((g) => g.id !== id));
      toast.add({ type: "success", title: "Goal deleted" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete goal";
      toast.add({ type: "error", title: "Delete failed", description: message });
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditingGoal(null); setShowForm(true); }}>
          + New Goal
        </Button>
      </div>

      {showForm && (
        <GoalForm
          goal={editingGoal}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingGoal(null); }}
        />
      )}

      {goals.length === 0 && !showForm && (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">No goals yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first goal to help Robin understand what matters to you.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={() => handleEdit(goal)}
            onDelete={() => handleDelete(goal.id)}
          />
        ))}
      </div>
    </div>
  );
}
