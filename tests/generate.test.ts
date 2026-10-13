import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Anthropic SDK: keep the real error classes, replace the client.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    messages = { create: createMock };
  }
  return { ...actual, default: MockAnthropic };
});

import { POST } from "../app/api/generate/route";

let ipCounter = 0;
function makeRequest(body: unknown, ip = `10.0.0.${++ipCounter}`) {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  // Placeholder only - the SDK is mocked, so no real request is ever made.
  vi.stubEnv("ANTHROPIC_API_KEY", "placeholder-for-tests");
  vi.stubEnv("CLAUDE_MODEL", "");
  createMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/generate - input validation", () => {
  it("rejects an empty prompt without calling the API", async () => {
    const res = await POST(makeRequest({ prompt: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/enter some text/i);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a prompt longer than 2,000 characters", async () => {
    const res = await POST(makeRequest({ prompt: "a".repeat(2001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too long/i);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate - API calls", () => {
  it("returns the text and caps max_tokens", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Line 1\nLine 2" }],
    });

    const res = await POST(makeRequest({ prompt: "Hello" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "Line 1\nLine 2", truncated: false });
    expect(createMock.mock.calls[0][0]).toMatchObject({ max_tokens: 800, model: "claude-haiku-5-5" });
  });

  it("hides internal error details from the user", async () => {
    createMock.mockRejectedValue(new Error("secret internal detail"));

    const res = await POST(makeRequest({ prompt: "Hello" }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error).toMatch(/something went wrong/i);
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
  });
});

describe("POST /api/generate - rate limit", () => {
  it("blocks the 11th request from the same IP within a minute", async () => {
    createMock.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });

    for (let i = 0; i < 10; i++) {
      expect((await POST(makeRequest({ prompt: "Hi" }, "203.0.113.7"))).status).toBe(200);
    }
    const res = await POST(makeRequest({ prompt: "Hi" }, "203.0.113.7"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });
});
