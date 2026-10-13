export const MAX_PROMPT_LENGTH = 2000;

export type ValidationResult =
  | { ok: true; prompt: string }
  | { ok: false; error: string };

/** Checks that the prompt is a non-empty string of at most MAX_PROMPT_LENGTH characters. */
export function validatePrompt(value: unknown): ValidationResult {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Please enter some text before generating." };
  }
  const prompt = value.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return {
      ok: false,
      error: `Your text is too long. Please keep it under ${MAX_PROMPT_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }
  return { ok: true, prompt };
}
