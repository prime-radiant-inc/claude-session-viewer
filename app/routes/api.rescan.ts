import { rescanDb } from "~/lib/db.server";

export async function action() {
  try {
    await rescanDb();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Rescan failed:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
