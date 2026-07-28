import { updateMenu } from "./_store";

// PUT /api/mock/menus/:id → replace the menu structure.
// Rejects untitled nodes so the demo also exercises the manager's
// backend-error mapping (errors mirror the payload's nested `nodes` shape).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id") ?? "";
  const body = await readBody(event);

  interface NodePayload {
    title?: string;
    nodes?: NodePayload[];
  }

  const validate = (nodes: NodePayload[] = []): unknown[] =>
    nodes.map((node) => {
      const errors: Record<string, unknown> = {};
      if (!node.title?.trim()) errors.title = ["This field cannot be blank."];
      const children = validate(node.nodes ?? []);
      if (children.some((c) => Object.keys(c as object).length > 0)) {
        errors.nodes = children;
      }
      return errors;
    });

  const translations = (body.translations ?? {}) as Record<
    string,
    { nodes?: NodePayload[] }
  >;
  const translationErrors: Record<string, unknown> = {};
  for (const [lang, tr] of Object.entries(translations)) {
    const nodeErrors = validate(tr.nodes ?? []);
    if (nodeErrors.some((e) => Object.keys(e as object).length > 0)) {
      translationErrors[lang] = { nodes: nodeErrors };
    }
  }

  if (Object.keys(translationErrors).length > 0) {
    throw createError({
      statusCode: 400,
      data: {
        detail: "Some nodes are invalid.",
        translations: translationErrors,
      },
    });
  }

  const updated = updateMenu(id, body);
  if (!updated)
    throw createError({ statusCode: 404, message: "Menu not found" });
  return updated;
});
