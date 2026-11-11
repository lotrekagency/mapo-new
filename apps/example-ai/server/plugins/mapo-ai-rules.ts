// The app's own rules for the AI, through the hooks of @mapomodule/ai
// (docs/modules/ai.md, "Restrict who uses the AI" and "Add the app's
// rules"):
// - `mapo-ai:user` runs for every request to the gateway, after
//   `mapo.ai.users` (nuxt.config.ts), and can only refuse. This backend
//   marks the accounts of people outside the company (`is_external`), whose
//   records must not reach an AI provider: the `contractor` account changes
//   articles as `writer` does, but `status` answers it `allowed: false`, the
//   other routes 403, and Magic Fill does not show. `payload` is the user as
//   `userInfoApi` returned them, with the fields the gateway does not read:
//   outside data, so the hook checks the value's type.
// - `mapo-ai:prompt` runs for every call of `run`, and its preview, and
//   can only add rules to the prompt: here, one for events. `mapo.ai.
//   instructions`, in nuxt.config.ts, holds the rules that never change.
//   Both show in "What I send to the AI".
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("mapo-ai:user", (context) => {
    if (context.payload.is_external === true) context.allowed = false;
  });

  nitroApp.hooks.hook("mapo-ai:prompt", (context) => {
    const hasEvent = context.entities.some(
      (entity) => entity.model === "event",
    );
    if (hasEvent) {
      context.addRule(
        "An event's times are local times of Milan. Leave the end empty when the source does not write one: never compute it from a duration.",
      );
    }
  });
});
