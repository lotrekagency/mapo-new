import { addMediaItem } from "./_store";

export default defineEventHandler(async (event) => {
  // In a real backend this would handle multipart upload.
  // For the mock we accept a JSON body with simulated fields.
  const body = await readBody(event).catch(() => ({}));

  // Simulate server-side processing: return the created media item
  const item = addMediaItem({
    file: body.file ?? `https://picsum.photos/seed/${Date.now()}/400/300`,
    mime_type: body.mime_type ?? "image/jpeg",
    title: body.title ?? "",
    alt_text: body.alt_text ?? "",
    description: body.description ?? "",
    size: body.size ?? Math.floor(Math.random() * 100000) + 20000,
    folder: body.folder ? parseInt(String(body.folder), 10) : null,
  });

  setResponseStatus(event, 201);
  return item;
});
