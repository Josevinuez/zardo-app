import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { type } = params;
	if (typeof type !== "string") throw new Error("Invalid type");
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const results = await prisma.notificationResult.findMany({
		where: {
			type,
			shown: false,
			createdAt: {
				gte: today,
			},
		},
	});

	return json({ results });
}
