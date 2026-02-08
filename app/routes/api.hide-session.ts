import { getDb, setSessionHidden } from "~/lib/db.server";

export async function action({ request }: { request: Request }) {
  try {
    const { sessionId, hidden } = await request.json();
    setSessionHidden(getDb(), sessionId, hidden);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Hide session failed:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
