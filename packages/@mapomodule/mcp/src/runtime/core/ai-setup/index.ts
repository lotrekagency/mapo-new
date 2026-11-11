export {
  AI_AREAS,
  AI_NEEDS,
  AI_NEED_IDS,
  AI_TOPICS,
  AI_VERDICTS,
  aiTopic,
  topicLink,
} from "./catalog.js";
export type {
  AiArea,
  AiNeed,
  AiNeedId,
  AiTopic,
  AiVerdict,
} from "./catalog.js";
export { AI_QUESTIONS, AI_ROUNDS } from "./questions.js";
export type { AiQuestion, AiQuestionOption } from "./questions.js";
export {
  AI_DEPLOY_CHOICES,
  AI_KEY_CHOICES,
  AI_MAGIC_FILL_CHOICES,
  AI_PROVIDER_CHOICES,
  aiSetupFiles,
  hasAiAnswers,
  renderAiSetupPlan,
  renderAiSetupQuestions,
} from "./plan.js";
export type { AiKeyChoice, AiProviderChoice, AiSetupAnswers } from "./plan.js";
