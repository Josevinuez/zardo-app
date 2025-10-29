import { type ActionFunctionArgs, json } from "@remix-run/node";
import prisma from "~/db.server";

export async function action({ request, params }: ActionFunctionArgs) {
	const { id: idAny } = params;
	if (typeof idAny !== "string") throw new Error("Invalid ID");
	const id = Number.parseInt(idAny);

	const result = await prisma.notificationResult.update({
		where: { id },
		data: {
			shown: true,
		},
	});
	console.log("result: ", result);
	return json({ id: result.id });
}
