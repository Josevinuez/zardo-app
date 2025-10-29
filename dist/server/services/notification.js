import prisma from "../db.js";
async function sendNotification({ length, title, type, }) {
    await prisma.notificationResult.create({
        data: {
            length,
            title,
            type,
        },
    });
}
export { sendNotification };
