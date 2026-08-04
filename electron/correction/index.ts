import type { CorrectionProviderId } from "../../src/lib/speech/correction";
import type { CodexService } from "../codex/service";

export type CorrectionResult = {
  text: string;
  /** Whether a provider actually transformed the text. */
  polished: boolean;
  /** Fail-open: provider ran but we fell back to raw. */
  fallbackReason?: string;
};

export type CorrectionContext = {
  codex: CodexService | null;
};

type CorrectionHandler = (
  text: string,
  ctx: CorrectionContext
) => Promise<CorrectionResult>;

/**
 * Provider registry — add local / OpenAI-compatible handlers here without
 * changing callers of polishTranscript.
 */
const providers: Record<CorrectionProviderId, CorrectionHandler> = {
  none: async (text) => ({ text, polished: false }),

  codex: async (text, ctx) => {
    if (!ctx.codex) {
      return {
        text,
        polished: false,
        fallbackReason: "موتور Codex آماده نیست.",
      };
    }
    try {
      const corrected = await ctx.codex.correctTranscript(text);
      return { text: corrected || text, polished: Boolean(corrected) };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "اصلاح با Codex ناموفق بود.";
      console.warn("[pst] correction failed, using raw transcript:", message);
      return { text, polished: false, fallbackReason: message };
    }
  },
};

/** Register or replace a provider at runtime (tests / future plugins). */
export function registerCorrectionProvider(
  id: CorrectionProviderId,
  handler: CorrectionHandler
) {
  providers[id] = handler;
}

/**
 * Provider-routed transcript polish. Today: none | codex.
 * Fail-open: errors return raw text + fallbackReason.
 */
export async function polishTranscript(options: {
  text: string;
  provider: CorrectionProviderId;
  codex: CodexService | null;
}): Promise<CorrectionResult> {
  const raw = options.text.trim();
  if (!raw) return { text: "", polished: false };

  const handler = providers[options.provider] ?? providers.none;
  return handler(raw, { codex: options.codex });
}
