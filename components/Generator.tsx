"use client";

import { useState } from "react";
import { MAX_PROMPT_LENGTH, validatePrompt } from "../lib/validate";

type Status = "idle" | "loading" | "success" | "error";

export default function Generator() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [answer, setAnswer] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const loading = status === "loading";

  async function generate() {
    // Same validation as the server, for instant feedback.
    const check = validatePrompt(prompt);
    if (!check.ok) {
      setStatus("error");
      setError(check.error);
      return;
    }

    setStatus("loading");
    setError("");
    setCopied(false);
    setCopyFailed(false);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: check.prompt }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || typeof data.text !== "string") {
        setStatus("error");
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setAnswer(data.text);
      setTruncated(Boolean(data.truncated));
      setStatus("success");
    } catch {
      setStatus("error");
      setError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopyFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context).
      setCopyFailed(true);
    }
  }

  return (
    <section className="card">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label htmlFor="prompt">Your text</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter submits.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !loading) generate();
          }}
          maxLength={MAX_PROMPT_LENGTH}
          rows={6}
          placeholder="For example: Write a short product description for a reusable water bottle"
          aria-describedby="prompt-help"
        />
        <div className="row">
          <span id="prompt-help" className="hint">
            {prompt.length.toLocaleString("en-US")} / {MAX_PROMPT_LENGTH.toLocaleString("en-US")} characters
          </span>
          <button type="submit" disabled={loading} aria-busy={loading}>
            {loading && <span className="spinner" aria-hidden="true" />}
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {status === "error" && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {status === "success" && (
          <div className="result">
            <div className="result-header">
              <h2>Response</h2>
              <button type="button" className="secondary" onClick={copy}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {copyFailed && (
              <p className="error" role="alert">
                Couldn&apos;t copy automatically. Please select the text and copy it.
              </p>
            )}
            <p className="answer">{answer}</p>
            {truncated && <p className="hint">The response was cut short because it reached the length limit.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
