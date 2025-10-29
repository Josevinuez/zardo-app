import prisma from "../db.js";
import type { NotificationEvent } from "../utils/notifications.js";

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
