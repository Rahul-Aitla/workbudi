"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GoalCard } from "./goal-card";
import { GoalForm } from "./goal-form";
import { Button } from "@/components/ui/button";
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
    if (editingGoal) {
      const { data } = await supabase
        .from("goals")
        .update({ title, description })
        .eq("id", editingGoal.id)
        .select()
        .single();
      if (data) setGoals(goals.map((g) => (g.id === data.id ? data : g)));
    } else {
      const { data } = await supabase
        .from("goals")
        .insert({ user_id: userId, title, description })
        .select()
        .single();
      if (data) setGoals([data, ...goals]);
    }
    setShowForm(false);
    setEditingGoal(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("goals").delete().eq("id", id);
    setGoals(goals.filter((g) => g.id !== id));
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
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No goals yet</p>
          <p className="text-sm">Create your first goal to help Robin understand what matters to you.</p>
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
