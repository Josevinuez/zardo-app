import { schemaTask, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { sendBulkEmailWithSES, loginDetails } from "~/modules/mail.server";
import { fillEmailTemplate } from "~/modules/template.server";
import { upsertEmailSent } from "~/modules/prisma.queries.server";
import { emailRepeatedCheck } from "~/modules/store.server";

export const processAddEmailsToVariant = schemaTask({
    id: "processAddEmailsToVariant",
    schema: z.object({
        emails: z.array(z.string().email()),
        item: z.object({
            name: z.string(),
            quantity: z.number(),
            imageURL: z.string().url(),
            link: z.string().url(),
            productId: z.string(),
        }),
        orginization: z.object({
            name: z.string(),
        }),
        bypass: z.boolean().optional(),
        attemptNo: z.number().optional(),
    }),
    queue: {
        concurrencyLimit: 1,
    },
    maxDuration: 120,
    run: async (
        { emails, item, orginization, bypass = false, attemptNo = 0 },
        { ctx }
    ) => {
        logger.info("Current working directory is:", { cwd: process.cwd() });
        if (await emailRepeatedCheck({ product_id: item.productId }) && !bypass) {
            return {
                error: "email has been sent in the last 24 hours",
            };
        }

        if ((emails.length > 0 && item.quantity > 0) || bypass) {
            const emailPayload = await fillEmailTemplate({
                ...item,
                orginizationName: orginization.name,
            });

            const chunkSize = 50;
            const emailChunks = [];
            for (let i = 0; i < emails.length; i += chunkSize) {
                emailChunks.push(emails.slice(i, i + chunkSize));
            }

            const results = await Promise.all(
                emailChunks.map(async (emailChunk) => {
                    const result = await sendBulkEmailWithSES({
                        from: loginDetails.from,
                        to: emailChunk,
                        subject: `Item from your wishlist now in stock !`,
                        htmlBody: emailPayload,
                        textBody: `New ${item.name} in stock!`,
                        attachments: [],
                    });
                    return result;
                })
            );

            await upsertEmailSent({
                create: {
                    id: item.productId,
                },
                update: {
                    lastSent: new Date(),
                },
                where: {
                    id: item.productId,
                },
            });

            return {
                results,
            };
        }
        return {
            error: "Item quantity or email length == 0",
            quantity: item.quantity,
            emails: emails,
        };
    },
});