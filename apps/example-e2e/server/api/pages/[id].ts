import { deletePage, getPage, updatePage } from "../../utils/pageDb";

export default defineEventHandler(async (event) => {
  const method = event.method;
  const id = Number(getRouterParam(event, "id"));

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: "Invalid id" });
  }

  if (method === "GET") {
    const page = getPage(id);
    if (!page)
      throw createError({
        statusCode: 404,
        data: { detail: "Page not found." },
      });
    return page;
  }

  if (method === "PATCH" || method === "PUT") {
    const body = await readBody(event);
    if ("title" in body && !body.title) {
      throw createError({
        statusCode: 400,
        data: { title: ["This field is required."] },
      });
    }
    const result = updatePage(id, body);
    if (!result)
      throw createError({
        statusCode: 404,
        data: { detail: "Page not found." },
      });
    return result;
  }

  if (method === "DELETE") {
    if (!deletePage(id))
      throw createError({
        statusCode: 404,
        data: { detail: "Page not found." },
      });
    setResponseStatus(event, 204);
    return null;
  }

  throw createError({ statusCode: 405, message: "Method not allowed" });
});
