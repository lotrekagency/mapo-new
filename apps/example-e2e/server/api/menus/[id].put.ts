import {
  getMenu,
  saveMenu,
  validateNodes,
  hasErrors,
  type MenuNode,
} from "../../utils/menuDb";

/**
 * Full update. Validates every node and answers `400` with an error tree that
 * mirrors the payload, which is what lets `MapoMenuManager` place each message
 * on the node (and language) that produced it.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  if (!getMenu(id))
    throw createError({ statusCode: 404, message: "Menu not found" });

  const body = await readBody(event);

  if (body.translations) {
    const translations = body.translations as Record<
      string,
      { nodes?: MenuNode[] }
    >;
    const errors: Record<string, unknown> = {};
    for (const [lang, tr] of Object.entries(translations)) {
      const tree = validateNodes(tr.nodes ?? []);
      if (hasErrors(tree)) errors[lang] = { nodes: tree };
    }
    if (Object.keys(errors).length > 0) {
      throw createError({
        statusCode: 400,
        data: { detail: "Some nodes are invalid.", translations: errors },
      });
    }
  } else {
    const tree = validateNodes(body.nodes ?? []);
    if (hasErrors(tree)) {
      throw createError({
        statusCode: 400,
        data: { detail: "Some nodes are invalid.", nodes: tree },
      });
    }
  }

  return saveMenu(id, body);
});
