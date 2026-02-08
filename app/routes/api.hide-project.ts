import { getDb, setProjectHidden } from "~/lib/db.server";

export async function action({ request }: { request: Request }) {
  try {
    const { name, hidden } = await request.json();
    setProjectHidden(getDb(), name, hidden);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Hide project failed:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
