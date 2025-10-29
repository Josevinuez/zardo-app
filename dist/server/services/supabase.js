import { createBrowserClient } from "@supabase/ssr";
import { extension } from "mime-types";
import { v4 as uuidv4 } from "uuid";
const supabase = createBrowserClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_KEY || "");
export async function uploadImageFile(image) {
    const ext = extension(image.type);
    if (!ext) {
        throw new Error("Invalid image type");
    }
    console.log(`Uploading image to Supabase: ${JSON.stringify(image)}`);
    try {
        return await supabase.storage
            .from("zardocards")
            .upload(`${uuidv4()}.${ext}`, image, {
            cacheControl: "3600",
            upsert: false,
            contentType: image.type,
        });
    }
    catch (error) {
        console.error(`Error uploading image to Supabase: ${error}`);
        throw error;
    }
}
export async function uploadImageBuffer(image, contentType) {
    const ext = extension(contentType);
    if (!ext) {
        throw new Error("Invalid image type");
    }
    return await supabase.storage
        .from("zardocards")
        .upload(`${uuidv4()}.${ext}`, image, {
        cacheControl: "3600",
        upsert: false,
        contentType: contentType,
    });
}
export { supabase, };
