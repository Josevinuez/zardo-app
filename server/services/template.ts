import { promises } from "node:fs";
import path from "node:path";

type EmailTemplateVariables = {
    name: string;
    quantity: number;
    link: string;
    imageURL: string;
    orginizationName: string;
}

const TEMPLATE_PATH = path.resolve(
    `${process.cwd()}/app`,
    "templates",
);
export async function fillEmailTemplate(fillIns: EmailTemplateVariables) {
    const template = await promises.readFile(path.resolve(`${TEMPLATE_PATH}/`, `wishlist_email.html`), "utf8");
    if (fillIns) {
        let returnValue = "";
        const templateFragments = template.split("{{");
        returnValue += templateFragments[0];
        for (let i = 1; i < templateFragments.length; i++) {
            const fragmentSections = templateFragments[i].split("}}", 2);
            returnValue += fillIns[`${fragmentSections[0] as keyof EmailTemplateVariables}`]; // kinda hacky but it works
            returnValue += fragmentSections[1];
        }
        return returnValue
    }
    return template
}