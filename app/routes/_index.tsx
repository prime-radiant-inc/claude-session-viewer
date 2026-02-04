import { AppShell } from "~/components/layout/AppShell";

export function meta() {
  return [{ title: "Sessions" }];
}

export default function Index() {
  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="heading-display text-2xl mb-4">Sessions</h1>
        <p className="text-slate">Loading...</p>
      </div>
    </AppShell>
  );
}
