/**
 * Model and price settings for the link assistant (server-side only). The model is
 * configurable so it can follow OpenAI's current low-cost text models without code changes.
 */
export function modelSettings(env = process.env) {
  return {
    model: env.LINK_ASSISTANT_MODEL || 'gpt-4o-mini',
    prices: {
      inputPer1M: Number(env.LINK_ASSISTANT_PRICE_INPUT_PER_1M ?? 0.15),
      outputPer1M: Number(env.LINK_ASSISTANT_PRICE_OUTPUT_PER_1M ?? 0.6),
    },
  };
}
