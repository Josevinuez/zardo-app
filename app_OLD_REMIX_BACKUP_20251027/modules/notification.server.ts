import prisma from "~/db.server";
import type { NotificationEvent } from "~/utils/notifications";

async function sendNotification({
	length,
	title,
	type,
}: Omit<NotificationEvent, "id" | "shown">) {
	await prisma.notificationResult.create({
		data: {
			length,
			title,
			type,
		},
	});
}

export { sendNotification };
