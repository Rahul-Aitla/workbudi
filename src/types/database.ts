export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  priority: number;
  deadline: string | null;
  status: "todo" | "in_progress" | "done";
  source: "manual" | "email";
  email_id: string | null;
  previous_deadline: string | null;
  previous_priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface Email {
  id: string;
  user_id: string;
  gmail_id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  from_address: string | null;
  from_name: string | null;
  received_at: string | null;
  body: string | null;
  processed: boolean;
  processing_status: string;
  in_reply_to: string | null;
  created_at: string;
}

export interface LinkedAccount {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  created_at: string;
}

export type Database = {
  public: {
    Tables: {
      users: { Row: User; Insert: Omit<User, "created_at">; Update: Partial<Omit<User, "id">> };
      goals: { Row: Goal; Insert: Omit<Goal, "id" | "created_at">; Update: Partial<Omit<Goal, "id" | "user_id">> };
      tasks: { Row: Task; Insert: Omit<Task, "id" | "created_at" | "updated_at">; Update: Partial<Omit<Task, "id" | "user_id">> };
      emails: { Row: Email; Insert: Omit<Email, "id" | "created_at">; Update: Partial<Omit<Email, "id" | "user_id">> };
      linked_accounts: { Row: LinkedAccount; Insert: Omit<LinkedAccount, "id" | "created_at">; Update: Partial<Omit<LinkedAccount, "id" | "user_id">> };
    };
  };
};
