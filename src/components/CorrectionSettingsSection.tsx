import {
  CheckCircle,
  SignIn,
  SignOut,
  Sparkle,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import type { CodexAccountStatus } from "@/lib/codex";
import {
  CORRECTION_PROVIDERS,
  type CorrectionProviderId,
} from "@/lib/speech/correction";

const selectButtonClass =
  "inline-flex min-h-10 items-center rounded-xl border border-[var(--color-primary)] bg-[#FFF7ED] px-3.5 text-sm font-semibold text-orange-900 transition duration-150 hover:border-orange-600 hover:bg-orange-50 active:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";

const activeBadgeClass =
  "inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-100 px-3.5 text-sm font-semibold text-orange-900";

function planLabel(planType: string | null) {
  if (!planType || planType === "unknown") return "طرح ChatGPT";
  const map: Record<string, string> = {
    free: "ChatGPT Free",
    plus: "ChatGPT Plus",
    pro: "ChatGPT Pro",
    team: "ChatGPT Team",
    business: "ChatGPT Business",
    enterprise: "ChatGPT Enterprise",
  };
  return map[planType.toLowerCase()] ?? `ChatGPT ${planType}`;
}

export function CorrectionSettingsSection({
  correctionProvider,
  codexStatus,
  codexBusy,
  onCorrectionProvider,
  onCodexLogin,
  onCodexRefresh,
  onCodexLogout,
}: {
  correctionProvider: CorrectionProviderId;
  codexStatus: CodexAccountStatus | null;
  codexBusy: boolean;
  onCorrectionProvider: (provider: CorrectionProviderId) => void;
  onCodexLogin: () => void;
  onCodexRefresh: () => void;
  onCodexLogout: () => void;
}) {
  const codexConnected = codexStatus?.state === "connected";
  const noneProvider = CORRECTION_PROVIDERS.find((p) => p.id === "none")!;
  const codexProvider = CORRECTION_PROVIDERS.find((p) => p.id === "codex")!;
  const codexActive = correctionProvider === "codex" && codexConnected;
  const noneActive =
    correctionProvider === "none" ||
    (correctionProvider === "codex" && !codexConnected);

  useEffect(() => {
    if (!codexConnected && correctionProvider === "codex") {
      onCorrectionProvider("none");
    }
  }, [codexConnected, correctionProvider, onCorrectionProvider]);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-xs text-stone-500">
        <Sparkle size={14} weight="bold" />
        بهبود متن بعد از تشخیص صدا
      </div>
      <div className="grid gap-2">
        <div
          className={cn(
            "rounded-2xl border px-3.5 py-3.5 transition duration-150",
            noneActive
              ? "border-orange-300 bg-orange-50"
              : "border-[#E8E4DC] bg-white"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1C1917]">
              {noneProvider.label}
            </h3>
            {noneActive && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800">
                فعال
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs leading-5 text-stone-500">
            {noneProvider.description}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {noneActive ? (
              <span className={activeBadgeClass}>
                <CheckCircle size={15} weight="fill" />
                در حال استفاده
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onCorrectionProvider("none")}
                className={selectButtonClass}
              >
                انتخاب
              </button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border px-3.5 py-3.5 transition duration-150",
            codexActive
              ? "border-orange-300 bg-orange-50"
              : "border-[#E8E4DC] bg-white"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1C1917]">
              {codexProvider.label}
            </h3>
            {codexActive && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800">
                فعال
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                codexConnected
                  ? "bg-orange-100 text-orange-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              {codexConnected ? "متصل" : "نیاز به ورود"}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-stone-500">
            از اشتراک ChatGPT شما استفاده می‌شود — کلید API لازم نیست.
            در اولین استفاده، موتور Codex (~۳۰۰ مگ) یک‌بار دانلود می‌شود.
          </p>
          {codexConnected ? (
            <div
              dir="ltr"
              className="mt-2 mr-auto w-fit max-w-full self-start text-left text-xs text-stone-600"
            >
              <div className="truncate">{codexStatus?.email}</div>
              <div className="mt-0.5 text-stone-400">
                {planLabel(codexStatus?.planType ?? null)}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-stone-500">
              {codexStatus?.message ||
                "برای اصلاح متن با Codex وارد حساب ChatGPT شوید."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {codexConnected ? (
              codexActive ? (
                <span className={activeBadgeClass}>
                  <CheckCircle size={15} weight="fill" />
                  در حال استفاده
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onCorrectionProvider("codex")}
                  className={selectButtonClass}
                >
                  انتخاب
                </button>
              )
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex min-h-10 cursor-not-allowed items-center rounded-xl border border-stone-300 bg-stone-100 px-3.5 text-sm font-semibold text-stone-400"
                >
                  انتخاب
                </button>
                <span className="text-xs font-medium text-amber-800">
                  ابتدا وارد ChatGPT شوید
                </span>
              </>
            )}
            {codexConnected ? (
              <>
                <button
                  type="button"
                  disabled={codexBusy}
                  onClick={onCodexRefresh}
                  className="min-h-10 rounded-xl bg-[#F5F3EF] px-3 text-sm text-[#1C1917] transition hover:bg-[#EDE9E3] disabled:opacity-50"
                >
                  تازه‌سازی
                </button>
                <button
                  type="button"
                  disabled={codexBusy}
                  onClick={onCodexLogout}
                  className="min-h-10 inline-flex items-center gap-1.5 rounded-xl bg-[#F5F3EF] px-3 text-sm text-[#1C1917] transition hover:bg-[#EDE9E3] disabled:opacity-50"
                >
                  <SignOut size={14} weight="bold" />
                  خروج
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={codexBusy}
                  onClick={onCodexLogin}
                  className="min-h-10 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3 text-sm font-medium text-white transition hover:bg-[var(--color-primary-bright)] disabled:opacity-50"
                >
                  {codexBusy ? (
                    <SpinnerGap size={14} className="animate-spin" />
                  ) : (
                    <SignIn size={14} weight="bold" />
                  )}
                  ورود با ChatGPT
                </button>
                <button
                  type="button"
                  disabled={codexBusy}
                  onClick={onCodexRefresh}
                  className="min-h-10 rounded-xl bg-[#F5F3EF] px-3 text-sm text-[#1C1917] transition hover:bg-[#EDE9E3] disabled:opacity-50"
                >
                  بررسی وضعیت
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
