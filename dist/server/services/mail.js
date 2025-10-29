import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
const EMAIL_FROM = process.env.EMAIL_FROM;
if (!EMAIL_FROM)
    throw Error("Email options invalid");
export const loginDetails = {
    from: EMAIL_FROM,
};
const ses = new SESv2Client({
    region: process.env.AWS_REGION || "us-east-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});
export async function sendBulkEmailWithSES({ from, to, subject, htmlBody, textBody, attachments }) {
    try {
        const params = {
            FromEmailAddress: from,
            Destination: {
                ToAddresses: [],
                BccAddresses: to,
            },
            Content: {
                Simple: {
                    Subject: { Data: subject },
                    Body: {
                        Html: { Data: htmlBody },
                        ...(textBody ? { Text: { Data: textBody } } : {}),
                    },
                    Attachments: attachments
                },
            }
        };
        const command = new SendEmailCommand(params);
        const result = await ses.send(command);
        console.log("SES sendBulkEmail result:", result);
        return { success: true, messageId: result.MessageId };
    }
    catch (error) {
        console.error("SES sendBulkEmail error:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
