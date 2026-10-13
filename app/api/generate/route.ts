import Anthropic, { APIConnectionError, APIError, RateLimitError } from "@anthropic-ai/sdk";
import { checkRateLimit, getClientIp } from "../../../lib/rateLimit";
import { validatePrompt } from "../../../lib/validate";

// Run on the Node.js runtime and never cache: every request is unique.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 800; // hard cap on output size (and cost) per request
const MAX_BODY_BYTES = 10_000; // a 2,000-character prompt fits easily

const SYSTEM_PROMPT =
  "You are a helpful assistant in a small public demo. Be concise: answer in about " +
  "150 to 200 words at most, and get straight to the point without a long introduction. " +
  "Use plain text (no Markdown formatting).";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(req: Request) {
  // 1. Rate limit before doing any work.
  const limit = checkRateLimit(getClientIp(req));
  if (!limit.ok) {
    return json(
      { error: "You're sending requests too quickly. Please wait a minute and try again." },
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  // 2. Parse and validate the input.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: "Your text is too long. Please shorten it and try again." }, 413);
  }
  let body: { prompt?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const result = validatePrompt(body?.prompt);
  if (!result.ok) {
    return json({ error: result.error }, 400);
  }

  // 3. The key is read from the server environment only - it never reaches the browser.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[generate] ANTHROPIC_API_KEY is not set");
    return json({ error: "The service isn't configured yet. Please try again later." }, 500);
  }

  try {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 30_000 });
    const message = await client.messages.create({
      model: process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      // Low effort keeps answers fast and leaves most of the token budget for the answer itself.
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: result.prompt }],
    });

    if (message.stop_reason === "refusal") {
      return json({ error: "Sorry, this request can't be answered. Please try a different one." }, 422);
    }

    // The response can include non-text blocks (e.g. thinking), so keep only text.
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      return json({ error: "No answer was generated. Please try again or rephrase your text." }, 502);
    }

    return json({ text, truncated: message.stop_reason === "max_tokens" });
  } catch (error) {
    // Log the details on the server; show the user a friendly message only.
    if (error instanceof APIError) {
      console.error(`[generate] Anthropic API error ${error.status}: ${error.message}`);
    } else {
      console.error("[generate] Unexpected error:", error);
    }

    if (error instanceof RateLimitError || error instanceof APIConnectionError) {
      return json({ error: "The service is busy right now. Please try again in a moment." }, 503);
    }
    return json({ error: "Something went wrong while generating a response. Please try again." }, 502);
  }
}
