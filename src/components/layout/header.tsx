"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/goals", label: "Goals" },
  { href: "/tasks", label: "Tasks" },
  { href: "/robin", label: "Robin" },
];

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold">
            WorkBudi
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                  pathname === item.href
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user.email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Logout
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="sm:hidden text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="sm:hidden border-t px-4 py-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`block text-sm py-2 px-3 rounded-md transition-colors ${
                pathname === item.href
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {user && (
            <p className="text-xs text-muted-foreground pt-2 border-t">{user.email}</p>
          )}
          <button
            onClick={handleLogout}
            className="block w-full text-left text-sm text-muted-foreground hover:text-foreground py-2"
          >
            Logout
          </button>
        </nav>
      )}
    </header>
  );
}
