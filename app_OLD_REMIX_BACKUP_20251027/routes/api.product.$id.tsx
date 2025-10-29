import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const id = params.id;
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      totalInventory: true,
      variants: {
        select: {
          id: true,
          title: true,
          price: true,
          sku: true,
          inventoryQuantity: true,
        },
        orderBy: { title: "asc" },
      },
    },
  });

  if (!product) return json({ error: "Not found" }, { status: 404 });
  return json(product);
} 