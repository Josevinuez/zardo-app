import { Attachment, SESv2Client, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-sesv2";


interface EmailDetails {
    from: string
}

const EMAIL_FROM = process.env.EMAIL_FROM;

if (!EMAIL_FROM) throw Error("Email options invalid")


export const loginDetails: EmailDetails = {
    from: EMAIL_FROM,
}

const ses = new SESv2Client({
    region: process.env.AWS_REGION || "us-east-2",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
});

type SendBulkEmailParams = {
    from: string;
    to: string[];
    subject: string;
    htmlBody: string;
    textBody?: string;
    attachments: Attachment[]
};

export async function sendBulkEmailWithSES({
    from,
    to,
    subject,
    htmlBody,
    textBody,
    attachments
}: SendBulkEmailParams) {
    try {
        const params: SendEmailCommandInput = {
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
    } catch (error) {
        console.error("SES sendBulkEmail error:", error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}