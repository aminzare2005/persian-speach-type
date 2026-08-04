import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { CodexAppServerClient } from "./app-server-client";
import type { CodexAccountStatus, CodexLoginResult } from "./types";
import {
  buildCorrectionUserPrompt,
  cleanCorrectedTranscript,
  CORRECTION_SYSTEM_PROMPT,
  DEFAULT_CORRECTION_PROMPT,
  MAX_CORRECTION_TEXT_CHARS,
} from "../../src/lib/speech/correction";

type RecordValue = Record<string, unknown>;

export type CodexClient = {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  onNotification(listener: (method: string, params: unknown) => void): () => void;
  onExit(listener: (error: Error) => void): () => void;
  dispose(): void;
};

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" ? (value as RecordValue) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function isTrustedCodexAuthUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "chatgpt.com" ||
      hostname.endsWith(".chatgpt.com") ||
      hostname === "openai.com" ||
      hostname.endsWith(".openai.com")
    );
  } catch {
    return false;
  }
}

/**
 * Slim Codex integration for Persian Speach Type: ChatGPT login + one-shot transcript correction.
 * No chat DB / agent tools — intentionally smaller than Nimruz's CodexService.
 */
export class CodexService {
  private readonly client: CodexClient;
  private readonly workspace: string;
  private readonly events = new EventEmitter();
  private loginCompletionError: string | null = null;
  private readonly cancelledLoginIds = new Set<string>();
  private correcting = false;
  private preferredModel: string | null = null;

  constructor(options: {
    codexHome: string;
    workspace: string;
    clientVersion?: string;
    client?: CodexClient;
    preferredModel?: string | null;
  }) {
    this.workspace = options.workspace;
    this.preferredModel = options.preferredModel ?? null;
    mkdirSync(this.workspace, { recursive: true, mode: 0o700 });
    this.client =
      options.client ??
      new CodexAppServerClient({
        codexHome: options.codexHome,
        clientVersion: options.clientVersion,
      });

    this.client.onNotification((method, params) => {
      if (method === "account/login/completed") {
        const completion = asRecord(params);
        const loginId = asString(completion?.loginId);
        const wasCancelled = loginId
          ? this.cancelledLoginIds.delete(loginId)
          : false;
        if (completion?.success === true) {
          this.loginCompletionError = null;
        } else if (wasCancelled) {
          this.loginCompletionError = null;
        } else {
          this.loginCompletionError =
            asString(completion?.error) ??
            "ورود به ChatGPT کامل نشد. دوباره تلاش کنید.";
        }
        this.events.emit("status-changed");
      } else if (method === "account/updated") {
        this.events.emit("status-changed");
      }
    });
    this.client.onExit(() => this.events.emit("status-changed"));
  }

  onStatusChanged(listener: () => void) {
    this.events.on("status-changed", listener);
    return () => this.events.off("status-changed", listener);
  }

  setPreferredModel(model: string | null) {
    this.preferredModel = model && model.trim() ? model.trim() : null;
  }

  async getAccountStatus(refreshToken = false): Promise<CodexAccountStatus> {
    try {
      const result = await this.client.request<unknown>("account/read", {
        refreshToken,
      });
      const account = asRecord(asRecord(result)?.account);
      if (account?.type === "chatgpt") {
        this.loginCompletionError = null;
        return {
          state: "connected",
          email: asString(account.email),
          planType: asString(account.planType) ?? "unknown",
          message: null,
        };
      }
      if (account) {
        return {
          state: "error",
          email: null,
          planType: null,
          message:
            "Codex با حساب غیر ChatGPT وارد شده. خارج شوید و با اشتراک ChatGPT وصل شوید.",
        };
      }
      return {
        state: "disconnected",
        email: null,
        planType: null,
        message: this.loginCompletionError,
      };
    } catch (error) {
      return {
        state: "unavailable",
        email: null,
        planType: null,
        message:
          error instanceof Error ? error.message : "Codex در دسترس نیست.",
      };
    }
  }

  async startLogin(
    flow: "browser" | "device-code" = "browser"
  ): Promise<CodexLoginResult> {
    this.loginCompletionError = null;
    const params =
      flow === "browser"
        ? {
            type: "chatgpt",
            useHostedLoginSuccessPage: true,
            appBrand: "chatgpt",
          }
        : { type: "chatgptDeviceCode" };
    const result = asRecord(
      await this.client.request<unknown>("account/login/start", params, 60_000)
    );
    const loginId = asString(result?.loginId);
    if (!loginId) throw new Error("شروع ورود Codex ناموفق بود.");

    if (result?.type === "chatgpt") {
      const authUrl = asString(result.authUrl);
      if (!authUrl || !isTrustedCodexAuthUrl(authUrl)) {
        await this.cancelLogin(loginId).catch(() => undefined);
        throw new Error("آدرس ورود Codex نامعتبر بود.");
      }
      return { type: "browser", loginId, authUrl };
    }

    if (result?.type === "chatgptDeviceCode") {
      const verificationUrl = asString(result.verificationUrl);
      const userCode = asString(result.userCode);
      if (
        !verificationUrl ||
        !isTrustedCodexAuthUrl(verificationUrl) ||
        !userCode
      ) {
        await this.cancelLogin(loginId).catch(() => undefined);
        throw new Error("ورود با کد دستگاه نامعتبر بود.");
      }
      return {
        type: "device-code",
        loginId,
        verificationUrl,
        userCode,
      };
    }

    await this.cancelLogin(loginId).catch(() => undefined);
    throw new Error("نوع ورود Codex پشتیبانی نمی‌شود.");
  }

  async cancelLogin(loginId: string) {
    if (!loginId || loginId.length > 256) return;
    if (this.cancelledLoginIds.size >= 32) this.cancelledLoginIds.clear();
    this.cancelledLoginIds.add(loginId);
    try {
      await this.client.request("account/login/cancel", { loginId });
      this.loginCompletionError = null;
    } catch (error) {
      this.cancelledLoginIds.delete(loginId);
      throw error;
    }
  }

  async logout() {
    await this.client.request("account/logout");
    this.loginCompletionError = null;
    this.cancelledLoginIds.clear();
    this.events.emit("status-changed");
  }

  private async resolveModelId() {
    if (this.preferredModel) return this.preferredModel;
    try {
      const result = asRecord(
        await this.client.request<unknown>("model/list", { limit: 40 }, 20_000)
      );
      const data = Array.isArray(result?.data) ? result.data : [];
      let fallback: string | null = null;
      for (const entry of data) {
        const model = asRecord(entry);
        const id = asString(model?.id) ?? asString(model?.model);
        if (!id) continue;
        if (model?.isDefault === true) return id;
        fallback ??= id;
      }
      if (fallback) return fallback;
    } catch {
      // fall through
    }
    return "gpt-5.4-codex";
  }

  private async deleteThread(threadId: string) {
    try {
      await this.client.request("thread/delete", { threadId }, 15_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.toLowerCase().includes("no rollout found")) throw error;
    }
  }

  /**
   * One-shot transcript correction using the user's ChatGPT/Codex subscription.
   */
  async correctTranscript(
    text: string,
    preference = DEFAULT_CORRECTION_PROMPT
  ): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("متنی برای اصلاح نیست.");
    if (trimmed.length > MAX_CORRECTION_TEXT_CHARS) {
      throw new Error("متن برای اصلاح خیلی طولانی است.");
    }
    if (this.correcting) {
      throw new Error("یک اصلاح دیگر در حال انجام است.");
    }

    const account = await this.getAccountStatus();
    if (account.state !== "connected") {
      throw new Error(
        "برای اصلاح با Codex ابتدا در تنظیمات به ChatGPT وصل شوید."
      );
    }

    this.correcting = true;
    let threadId: string | null = null;
    let unsubscribeNotification: () => void = () => undefined;
    let unsubscribeExit: () => void = () => undefined;

    try {
      const model = await this.resolveModelId();
      const started = asRecord(
        await this.client.request<unknown>("thread/start", {
          model,
          cwd: this.workspace,
          approvalPolicy: "never",
          developerInstructions: CORRECTION_SYSTEM_PROMPT,
          ephemeral: true,
        })
      );
      threadId = asString(asRecord(started?.thread)?.id);
      if (!threadId) throw new Error("Codex گفتگو را شروع نکرد.");

      const prompt = buildCorrectionUserPrompt(trimmed, preference);
      const messageId = randomUUID();
      let correctedText = "";
      const buffered: Array<{ method: string; params: unknown }> = [];
      let turnId: string | null = null;
      let terminalError: Error | null = null;
      let settle!: (value: "completed" | "interrupted") => void;
      let reject!: (error: Error) => void;
      const completed = new Promise<"completed" | "interrupted">(
        (resolve, rejectPromise) => {
          settle = resolve;
          reject = rejectPromise;
        }
      );

      const handleNotification = (method: string, value: unknown) => {
        const params = asRecord(value);
        if (asString(params?.threadId) !== threadId) return;
        const notificationTurnId =
          asString(params?.turnId) ?? asString(asRecord(params?.turn)?.id);
        if (!turnId) {
          buffered.push({ method, params: value });
          return;
        }
        if (notificationTurnId && notificationTurnId !== turnId) return;

        if (method === "item/agentMessage/delta") {
          const delta = typeof params?.delta === "string" ? params.delta : "";
          if (delta) correctedText += delta;
          return;
        }
        if (method === "error" && params?.willRetry !== true) {
          const message = asString(asRecord(params?.error)?.message);
          if (message) terminalError = new Error(message);
          return;
        }
        if (method === "turn/completed") {
          const turn = asRecord(params?.turn);
          const status = asString(turn?.status);
          if (status === "completed") settle("completed");
          else if (status === "interrupted") settle("interrupted");
          else {
            const message = asString(asRecord(turn?.error)?.message);
            reject(
              terminalError ??
                new Error(message ?? "Codex نتوانست پاسخ بدهد.")
            );
          }
        }
      };

      unsubscribeNotification = this.client.onNotification(handleNotification);
      unsubscribeExit = this.client.onExit((error) => reject(error));

      const turnResponse = asRecord(
        await this.client.request<unknown>(
          "turn/start",
          {
            threadId,
            clientUserMessageId: messageId,
            input: [{ type: "text", text: prompt, text_elements: [] }],
          },
          120_000
        )
      );
      turnId = asString(asRecord(turnResponse?.turn)?.id);
      if (!turnId) throw new Error("Codex پاسخ را شروع نکرد.");

      for (const notification of buffered.splice(0)) {
        handleNotification(notification.method, notification.params);
      }

      const status = await completed;
      if (status !== "completed") {
        throw new Error("اصلاح متن قطع شد.");
      }
      const cleaned = cleanCorrectedTranscript(correctedText);
      if (!cleaned) {
        throw new Error("مدل متن اصلاح‌شده‌ای برنگرداند.");
      }
      return cleaned;
    } finally {
      unsubscribeNotification();
      unsubscribeExit();
      if (threadId) {
        await this.deleteThread(threadId).catch(() => undefined);
      }
      this.correcting = false;
    }
  }

  dispose() {
    this.events.removeAllListeners();
    this.client.dispose();
  }
}
