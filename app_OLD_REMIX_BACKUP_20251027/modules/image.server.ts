export async function imageToBase64(imageUrl: string) {
    try {
        const response = await fetch(imageUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64String = buffer.toString('base64');
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        const array = base64ToUint8Array(base64String);
        return { base64: base64String, mimeType, base64Html: `data:${mimeType};base64,${base64String}`, array };
    } catch (error) {
        console.error("Error fetching or encoding image:", error);
        throw error;
    }
}
export function base64ToUint8Array(base64String: string) {
    const binaryString = atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}