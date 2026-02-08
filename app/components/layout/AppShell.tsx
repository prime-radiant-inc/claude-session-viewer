import { Link } from "react-router";

export function AppShell({ children, headerRight }: { children: React.ReactNode; headerRight?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-edge px-6 py-3 flex items-center justify-between">
        <Link to="/" className="font-display text-lg font-medium italic text-ink">
          Sessions
        </Link>
        {headerRight}
      </header>
      <main>{children}</main>
    </div>
  );
}
