import { json, type ActionFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const shop = String(form.get("shop") || "").trim();
  const secret = String(form.get("secret") || "").trim();

  const expected = process.env.ADMIN_MAINTENANCE_SECRET;
  if (!expected) {
    return json({ ok: false, error: "ADMIN_MAINTENANCE_SECRET not set on server" }, { status: 500 });
  }
  if (!shop) {
    return json({ ok: false, error: "Missing 'shop' (e.g., my-shop.myshopify.com)" }, { status: 400 });
  }
  if (!secret || secret !== expected) {
    return json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Purge all sessions for this shop (offline + any online)
  const result = await prisma.session.deleteMany({ where: { shop } });
  return json({ ok: true, shop, deleted: result.count });
}

export const loader = () => json({ ok: false, error: "POST only" }, { status: 405 });

