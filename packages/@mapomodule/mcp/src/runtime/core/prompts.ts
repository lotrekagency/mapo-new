/**
 * MCP prompts: the workflows, exposed as slash-commands in the IDE.
 *
 * A prompt is not documentation — it is an instruction the model receives as if
 * the user had typed it. So each one names the exact tools to call and the
 * order, which is the part a model gets wrong when left to improvise.
 *
 * Every tool named here must exist: a prompt that references a missing tool
 * wastes a turn and teaches the model to distrust the server.
 */
import { z } from "zod";
import type { ZodRawShape } from "zod";

export interface MapoPrompt<Args = Record<string, string | undefined>> {
  name: string;
  title: string;
  description: string;
  argsSchema: ZodRawShape;
  /** The user-role message handed to the model. */
  render: (args: Args) => string;
}

const optional = (description: string) =>
  z.string().optional().describe(description);

export const crudPagePrompt: MapoPrompt<{
  resource?: string;
  fields?: string;
}> = {
  name: "mapo-crud-page",
  title: "Build a CRUD page",
  description:
    "List + detail pages for a resource, following Mapo's canonical pattern.",
  argsSchema: {
    resource: optional("Resource name, e.g. 'articles'"),
    fields: optional("Fields to edit, e.g. 'title, body, status, cover image'"),
  },
  render: ({
    resource,
    fields,
  }) => `Build the admin pages for ${resource ?? "a resource I will name"} in this Mapo project${
    fields ? `, editing: ${fields}` : ""
  }.

Follow this order and do not skip a step:
1. mapo_inspect_app — see which field types are registered, which components exist and how the app is configured.
2. mapo_list_field_types — pick the right \`type\` for each field, and read the \`attrs\` it accepts. Never invent a type.
3. mapo_scaffold with kind "list-page", then kind "detail-page", passing \`fields\` as \`key:type:Label\` specs. Review the output before writing anything.
4. mapo_component_api for MapoList and MapoDetail if you need a prop, slot or event that the scaffold does not cover.

Then adapt the generated code to the real backend payload, and tell me which endpoints it expects.`,
};

export const customFieldPrompt: MapoPrompt<{
  type?: string;
  behaviour?: string;
}> = {
  name: "mapo-custom-field",
  title: "Create a custom field type",
  description:
    "A new field component plus its registration in the form registry.",
  argsSchema: {
    type: optional("Type name, e.g. 'star-rating'"),
    behaviour: optional("What the field should do"),
  },
  render: ({
    type,
    behaviour,
  }) => `Add a custom form field type${type ? ` called \`${type}\`` : ""} to this Mapo project${
    behaviour ? `: ${behaviour}` : ""
  }.

Steps:
1. mapo_list_field_types — check no built-in type already does this; overriding a built-in is a different decision than adding one.
2. mapo_get_doc { path: "uikit/form/registry.md" } — the registration contract.
3. mapo_scaffold with kind "custom-field" — it generates both the component and the plugin that registers the type.
4. Implement the component body. It must accept \`modelValue\`, \`descriptor\`, \`errors\`, \`readonly\`, \`disabled\` and emit \`update:modelValue\`. Nothing else.

Remember that types registered at runtime are invisible to mapo_inspect_app, which reads a build-time snapshot.`,
};

export const debugFormPrompt: MapoPrompt<{ symptom?: string }> = {
  name: "mapo-debug-form",
  title: "Debug a Mapo form",
  description:
    "Diagnose a form that does not render, validate or save as expected.",
  argsSchema: {
    symptom: optional("What goes wrong, e.g. 'the select is empty'"),
  },
  render: ({
    symptom,
  }) => `A Mapo form is not behaving${symptom ? `: ${symptom}` : ""}. Diagnose it.

Steps:
1. mapo_doctor — rule out a configuration problem before reading any code.
2. mapo_inspect_app { include: ["fields", "config"] } — confirm the field type used is actually registered.
3. mapo_list_field_types { type: "<the type>" } — check the descriptor's \`attrs\` against what the code passes; a missing required attr is the usual cause of an empty or inert field.
4. mapo_search_docs for the specific behaviour (validation, translatable fields, repeater, accessors) and read the section with mapo_get_doc.

Report the cause before proposing a fix, and quote the doc path you relied on.`,
};

export const migratePrompt: MapoPrompt<{ area?: string }> = {
  name: "mapo-migrate-v1",
  title: "Migrate from Mapo v1",
  description: "Port v1 code to the v2 APIs.",
  argsSchema: {
    area: optional("What to migrate, e.g. 'the list configuration'"),
  },
  render: ({
    area,
  }) => `Migrate this code from Mapo v1 to v2${area ? `, focusing on ${area}` : ""}.

Steps:
1. mapo_get_doc { path: "migration/v1-to-v2.md" } — read it before changing anything.
2. mapo_component_api / mapo_list_field_types for every symbol you touch: v1 names survive in training data long after they stop existing, so check each one against the installed source.
3. mapo_search_docs for anything the migration page does not cover.

Do not port v1 patterns that v2 replaced (Vuex stores, Axios instances, config objects where v2 takes declarative props). Point them out instead.`,
};

export const themePrompt: MapoPrompt<{ goal?: string }> = {
  name: "mapo-theme",
  title: "Restyle the admin",
  description:
    "Change the look of a Mapo admin, from tokens to full component replacement.",
  argsSchema: {
    goal: optional(
      "What should change, e.g. 'brand colours and a denser sidebar'",
    ),
  },
  render: ({ goal }) => `Restyle this Mapo admin${goal ? `: ${goal}` : ""}.

Pick the lightest layer that does the job, in this order:
1. mapo_get_doc { path: "howto/theming.md" } — CSS tokens and Nuxt UI defaults cover most requests.
2. mapo_scaffold with kind "theme-override" for the token file and the nuxt.config fragment.
3. Layout slots, if the change is structural — mapo_component_api on the layout components to see which slots exist.
4. The MapoOverride system only as a last resort: mapo_get_doc { path: "uikit/mapoverride.md" }. Replacing a component means owning its updates.

Say which layer you chose and why.`,
};

export const PROMPTS = [
  crudPagePrompt,
  customFieldPrompt,
  debugFormPrompt,
  migratePrompt,
  themePrompt,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as Array<MapoPrompt<any>>;
