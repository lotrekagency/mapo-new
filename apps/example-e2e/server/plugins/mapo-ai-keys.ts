// The provider of the AI keys lab (app/pages/ai/keys.vue). It calls no
// model: it declares that it calls with a key, so the gateway gives each
// call the key nearest the user (their own token where an admin allows it,
// a key the admins assigned to them, a group of theirs or everyone, the
// project's from NUXT_MAPO_AI_PROVIDERS_EXAMPLE_KEYS_API_KEY), and it
// answers with a refusal that names the key it got by its last four
// characters, as `status` shows them. A real provider sends the key to its
// server, and never repeats it.
export default defineNitroPlugin(() => {
  registerMapoAiProvider({
    id: "example-keys",
    label: "Keys lab",
    key: "required",
    capabilities: {
      structuredOutput: "json",
      pdf: false,
      images: false,
      streaming: false,
      tools: false,
    },
    models: ["keys-small", "keys-large"],
    async run(request) {
      const key = request.apiKey ?? "";
      const named =
        key.length >= 16
          ? `the key ending in ${key.slice(-4)}`
          : `a key of ${key.length} characters`;
      return {
        status: "refused",
        refusal: `The keys lab writes no record: it got ${named}, for the model ${request.model}.`,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    },
  });
});
