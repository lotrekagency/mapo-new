// The app's own rules for the AI, through the hooks of @mapomodule/ai
// (docs/modules/ai.md):
// - `mapo-ai:user` runs for every request to the gateway, and can only
//   refuse. This app keeps the `viewer` account out: `status` answers
//   `allowed: false` to it, and `run` 403. A real app would read a flag of
//   its backend's user instead, such as `is_staff`, from `context.payload`.
// - `mapo-ai:prompt` runs for every call of `run`, and can only add rules
//   to the prompt: here, one for articles. `mapo.ai.instructions`, in
//   nuxt.config.ts, holds the rules that never change.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("mapo-ai:user", (context) => {
    if (context.user.username === "viewer") context.allowed = false;
  });

  nitroApp.hooks.hook("mapo-ai:prompt", (context) => {
    const hasArticle = context.entities.some(
      (entity) => entity.model === "article",
    );
    if (hasArticle) {
      context.addRule(
        "An article's slug is lowercase words joined by hyphens. Leave it empty when the source does not write one.",
      );
    }
  });
});
