import { Link } from "react-router";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-white border-b border-edge px-6 py-3">
        <Link to="/" className="font-display text-lg font-medium italic text-ink">
          Sessions
        </Link>
      </header>
      <main>{children}</main>
    </div>
  );
}
