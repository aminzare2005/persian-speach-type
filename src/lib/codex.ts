/** Shared Codex account / login types for main + renderer. */

export type CodexAccountState =
  | "connected"
  | "disconnected"
  | "unavailable"
  | "error";

export type CodexAccountStatus = {
  state: CodexAccountState;
  email: string | null;
  planType: string | null;
  message: string | null;
};

export type CodexLoginResult =
  | {
      type: "browser";
      loginId: string;
      authUrl: string;
    }
  | {
      type: "device-code";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    };
