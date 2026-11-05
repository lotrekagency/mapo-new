import { createPage, getPages } from "../../utils/pageDb";
import { pageMetadata } from "../../utils/pageMetadata";

export default defineEventHandler(async (event) => {
  const method = event.method;

  if (method === "GET") {
    const query = getQuery(event);
    return getPages(query.search as string | undefined);
  }

  if (method === "POST") {
    const body = await readBody(event);
    if (!body?.title) {
      throw createError({
        statusCode: 400,
        data: { title: ["This field is required."] },
      });
    }
    return createPage(body);
  }

  // DRF's standard metadata: the gateway reads it with the form's fields.
  if (method === "OPTIONS") return pageMetadata();

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
