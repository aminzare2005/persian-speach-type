import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  ClockCounterClockwise,
  Copy,
  DownloadSimple,
  FolderOpen,
  GearSix,
  Keyboard,
  SpinnerGap,
  Stop,
  WarningCircle,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CorrectionSettingsSection } from "@/components/CorrectionSettingsSection";
import { cn } from "@/lib/cn";
import {
  DEFAULT_HOTKEY,
  eventToAccelerator,
  isModifierKey,
  isValidAccelerator,
} from "@/lib/hotkey";
import { useDictation } from "@/hooks/use-dictation";
import type { PanelView } from "@/lib/app-settings";
import type { CodexAccountStatus } from "@/lib/codex";
import type { CorrectionProviderId } from "@/lib/speech/correction";
import {
  formatBytes,
  SHENAVA_MODELS,
  type ShenavaModelKey,
  type ShenavaModelStatus,
  type ShenavaStatus,
  INITIAL_SHENAVA_STATUS,
} from "@/lib/speech/shenava";

const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] as const },
  },
};

function windowRole(): "hud" | "panel" {
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "panel" ? "panel" : "hud";
}

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, value)).toLocaleString("fa-IR")}٪`;
}

function modelSourceLabel(source: ShenavaModelStatus["source"]) {
  if (source === "nimruz") return "موجود در نیمروز";
  if (source === "local") return "نصب محلی";
  return null;
}

export default function App() {
  return windowRole() === "panel" ? <PanelApp /> : <HudApp />;
}

const hudPillMotion = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 10,
    scale: 0.96,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const },
  },
};

function HudApp() {
  const dictation = useDictation();
  const recording = dictation.phase === "recording";
  const polishing = dictation.phase === "polishing";
  const feedback = dictation.phase === "feedback";
  const feedbackSuccess = feedback && dictation.feedback?.type === "success";
  const busy =
    dictation.phase === "transcribing" || dictation.phase === "polishing";
  const showHud = recording || busy || feedback;
  const hideAfterExitRef = useRef(false);
  hideAfterExitRef.current = !showHud && dictation.phase === "idle";

  const busyLabel = polishing ? "دارم اصلاح می‌کنم" : "دارم می‌نویسم";
  const busyHint = polishing ? "با Codex…" : "چند لحظه…";
  const feedbackMessage = dictation.feedback?.message ?? "";

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-end overflow-hidden p-0">
      <AnimatePresence
        onExitComplete={() => {
          if (hideAfterExitRef.current) {
            void window.pst.window.hide();
          }
        }}
      >
        {showHud && (
          <motion.div
            key="hud-pill"
            {...hudPillMotion}
            className={cn(
              "hud-pill flex h-full w-full items-center gap-2 rounded-full px-1.5",
              feedback
                ? feedbackSuccess
                  ? "hud-pill--feedback-success"
                  : "hud-pill--feedback"
                : recording
                  ? "hud-pill--listening"
                  : "hud-pill--busy"
            )}
            role="status"
            aria-live="polite"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white",
                feedback
                  ? feedbackSuccess
                    ? "bg-emerald-500"
                    : "bg-amber-500"
                  : recording
                    ? "bg-[#ef4444]"
                    : "bg-[var(--color-primary)]"
              )}
            >
              {feedback ? (
                feedbackSuccess ? (
                  <CheckCircle size={18} weight="fill" />
                ) : (
                  <WarningCircle size={18} weight="fill" />
                )
              ) : busy ? (
                <SpinnerGap size={18} weight="bold" className="animate-spin" />
              ) : (
                <Waveform size={18} weight="bold" className="listening-wave" />
              )}
            </span>

            <div className="min-w-0 flex-1 leading-none">
              <div
                className={cn(
                  "truncate text-[13px] font-semibold tracking-tight",
                  feedback
                    ? feedbackSuccess
                      ? "text-emerald-950"
                      : "text-amber-950"
                    : recording
                      ? "text-red-950"
                      : "text-orange-950"
                )}
              >
                {feedback
                  ? feedbackMessage
                  : recording
                    ? "گوش می‌دهم"
                    : busyLabel}
              </div>
              <div
                className={cn(
                  "mt-1 text-[11px] tabular-nums",
                  feedback
                    ? feedbackSuccess
                      ? "text-emerald-800/80"
                      : "text-amber-800/80"
                    : recording
                      ? "text-red-800/75"
                      : "text-orange-800/75"
                )}
              >
                {feedback
                  ? feedbackSuccess
                    ? "با Ctrl+V بچسبانید"
                    : "دوباره امتحان کنید"
                  : recording
                    ? formatTimer(dictation.seconds)
                    : busyHint}
              </div>
            </div>

            {recording ? (
              <button
                type="button"
                aria-label="توقف"
                onClick={dictation.toggleFromUi}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-900/10 text-red-900 transition hover:bg-red-900/15"
              >
                <Stop size={16} weight="fill" />
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PanelApp() {
  const [view, setView] = useState<PanelView | null>(null);
  const [resultText, setResultText] = useState("");
  const [toast, setToast] = useState<{ type: string; message: string } | null>(
    null
  );
  const [settings, setSettings] = useState({
    hotkey: DEFAULT_HOTKEY,
    launchAtLogin: true,
    websiteUrl: "https://github.com",
    correctionProvider: "none" as CorrectionProviderId,
    codexModelId: "",
  });
  const [history, setHistory] = useState<
    Array<{ id: string; text: string; createdAt: string }>
  >([]);
  const [status, setStatus] = useState<ShenavaStatus>(INITIAL_SHENAVA_STATUS);
  const [downloading, setDownloading] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexAccountStatus | null>(
    null
  );
  const [codexBusy, setCodexBusy] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (type: string, message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 2000);
  };

  const navigate = (next: PanelView, text = "") => {
    setView(next);
    if (next === "result") setResultText(text);
    void window.pst.window.showPanel(
      next,
      next === "result" ? { text } : undefined
    );
  };

  const goHome = () => navigate("home");

  useEffect(() => {
    document.documentElement.classList.add("panel-window");
    document.body.classList.add("panel-window");
    return () => {
      document.documentElement.classList.remove("panel-window");
      document.body.classList.remove("panel-window");
    };
  }, []);

  useEffect(() => {
    void window.pst.settings.get().then((s) => {
      setSettings({
        hotkey: s.hotkey,
        launchAtLogin: s.launchAtLogin,
        websiteUrl: s.websiteUrl,
        correctionProvider: s.correctionProvider ?? "none",
        codexModelId: s.codexModelId ?? "",
      });
    });
    void window.pst.speech.shenava.getStatus().then(setStatus);
    void window.pst.codex.getStatus().then(setCodexStatus);
    void window.pst.panel.getState().then((state) => {
      if (state.view) {
        setView(state.view);
        if (state.view === "result") setResultText(state.text);
      }
    });
    const offStatus = window.pst.speech.shenava.onStatus(setStatus);
    const offCodex = window.pst.codex.onStatusChanged(setCodexStatus);
    const offShow = window.pst.panel.onShow(({ view: next, text }) => {
      setView(next);
      if (next === "result") setResultText(text);
    });
    const offHide = window.pst.panel.onHide(() => {
      setView(null);
      setResultText("");
    });
    const offToast = window.pst.toast.on((payload) => {
      showToast(payload.type, payload.message);
    });
    return () => {
      offStatus();
      offCodex();
      offShow();
      offHide();
      offToast();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (view === "history") {
      void window.pst.history.list().then(setHistory);
    }
  }, [view]);

  useEffect(() => {
    return window.pst.history.onChanged(() => {
      if (view === "history") {
        void window.pst.history.list().then(setHistory);
      }
    });
  }, [view]);

  const closePanel = () => {
    setView(null);
    setResultText("");
    void window.pst.window.hidePanel();
  };

  if (!view) {
    return <div className="h-full w-full bg-[#FAFAF8]" />;
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-[#FAFAF8]">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "pointer-events-none absolute inset-x-3 bottom-3 z-50 flex items-center justify-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium shadow-lg",
              toast.type === "error"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-orange-300 bg-orange-50 text-orange-950"
            )}
            role="status"
            aria-live="polite"
          >
            {toast.type === "error" ? (
              <WarningCircle
                size={18}
                weight="fill"
                className="shrink-0 text-amber-600"
              />
            ) : (
              <CheckCircle
                size={18}
                weight="fill"
                className="shrink-0 text-orange-600"
              />
            )}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "home" && (
            <motion.div
              key="home"
              {...pageMotion}
              className="flex h-full min-h-0 flex-col"
            >
              <HomePage
                hotkey={settings.hotkey}
                status={status}
                onOpenSettings={() => navigate("settings")}
                onOpenHistory={() => navigate("history")}
              />
            </motion.div>
          )}

          {view === "settings" && (
            <motion.div
              key="settings"
              {...pageMotion}
              className="flex h-full min-h-0 flex-col"
            >
              <SettingsPage
                settings={settings}
                status={status}
                downloading={downloading}
                codexStatus={codexStatus}
                codexBusy={codexBusy}
                onBack={goHome}
                onSaveHotkey={async (hotkey) => {
                  const nextHotkey = hotkey.trim() || DEFAULT_HOTKEY;
                  if (nextHotkey === settings.hotkey) return;
                  const next = await window.pst.settings.set({
                    hotkey: nextHotkey,
                  });
                  setSettings((s) => ({ ...s, hotkey: next.hotkey }));
                  if (next.hotkey === nextHotkey) {
                    showToast("success", "شورتکات ذخیره شد.");
                  }
                  // Registration failure: main process toasts + returns prior settings.
                }}
                onToggleLogin={async (value) => {
                  const next = await window.pst.settings.set({
                    launchAtLogin: value,
                  });
                  setSettings((s) => ({
                    ...s,
                    launchAtLogin: next.launchAtLogin,
                  }));
                }}
                onCorrectionProvider={async (provider) => {
                  if (
                    provider === "codex" &&
                    codexStatus?.state !== "connected"
                  ) {
                    return;
                  }
                  const next = await window.pst.settings.set({
                    correctionProvider: provider,
                  });
                  setSettings((s) => ({
                    ...s,
                    correctionProvider: next.correctionProvider,
                  }));
                }}
                onCodexLogin={async () => {
                  setCodexBusy(true);
                  try {
                    await window.pst.codex.startLogin("browser");
                    showToast(
                      "success",
                      "مرورگر باز شد؛ ورود ChatGPT را کامل کنید."
                    );
                  } catch (error) {
                    showToast(
                      "error",
                      error instanceof Error
                        ? error.message
                        : "شروع ورود Codex ناموفق بود."
                    );
                  } finally {
                    setCodexBusy(false);
                  }
                }}
                onCodexRefresh={async () => {
                  setCodexBusy(true);
                  try {
                    const next = await window.pst.codex.getStatus(true);
                    setCodexStatus(next);
                    if (next.state === "connected") {
                      showToast("success", "حساب ChatGPT متصل است.");
                    } else {
                      showToast(
                        "info",
                        next.message || "هنوز به ChatGPT وصل نیستید."
                      );
                    }
                  } finally {
                    setCodexBusy(false);
                  }
                }}
                onCodexLogout={async () => {
                  setCodexBusy(true);
                  try {
                    await window.pst.codex.logout();
                    setCodexStatus(await window.pst.codex.getStatus());
                    showToast("success", "از Codex خارج شدید.");
                  } catch (error) {
                    showToast(
                      "error",
                      error instanceof Error
                        ? error.message
                        : "خروج از Codex ناموفق بود."
                    );
                  } finally {
                    setCodexBusy(false);
                  }
                }}
                onDownload={async (key) => {
                  setDownloading(true);
                  try {
                    const next = await window.pst.speech.shenava.download(key);
                    setStatus(next);
                    if (next.models[key].installed) {
                      showToast("success", "مدل آماده است.");
                    } else if (next.models[key].phase === "error") {
                      showToast("error", "دانلود مدل ناموفق بود.");
                    }
                  } catch {
                    showToast("error", "دانلود مدل ناموفق بود.");
                  } finally {
                    setDownloading(false);
                  }
                }}
                onCancelDownload={async () => {
                  await window.pst.speech.shenava.cancelDownload();
                  showToast("success", "دانلود لغو شد.");
                }}
                onSelect={async (key) => {
                  const next = await window.pst.speech.shenava.select(key);
                  setStatus(next);
                }}
                onRevealPath={async (modelPath) => {
                  const ok =
                    await window.pst.shell.showItemInFolder(modelPath);
                  if (!ok) {
                    showToast("error", "باز کردن پوشه ممکن نشد.");
                  }
                }}
              />
            </motion.div>
          )}

          {view === "history" && (
            <motion.div
              key="history"
              {...pageMotion}
              className="flex h-full min-h-0 flex-col"
            >
              <HistoryPage
                items={history}
                onBack={goHome}
                onClear={async () => {
                  setHistory(await window.pst.history.clear());
                }}
                onCopy={async (text) => {
                  await window.pst.clipboard.write(text);
                  showToast("success", "در کلیپ‌بورد کپی شد");
                }}
              />
            </motion.div>
          )}

          {view === "result" && (
            <motion.div
              key="result"
              {...pageMotion}
              className="flex h-full min-h-0 flex-col"
            >
              <ResultPage
                text={resultText}
                onCopy={async () => {
                  await window.pst.clipboard.write(resultText);
                  showToast("success", "در کلیپ‌بورد کپی شد");
                }}
                onClose={closePanel}
                onBack={goHome}
              />
            </motion.div>
          )}

          {view === "needs-model" && (
            <motion.div
              key="needs-model"
              {...pageMotion}
              className="flex h-full min-h-0 flex-col"
            >
              <ModelNeededPage
                onOpenSettings={() => navigate("settings")}
                onBack={goHome}
                onClose={closePanel}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-stone-500 transition duration-150 hover:bg-[#F5F3EF] hover:text-[#1C1917] active:bg-[#EDE9E3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
        className
      )}
    >
      {children}
    </button>
  );
}

function PageHeader({
  title,
  icon,
  onBack,
  trailing,
}: {
  title: string;
  icon?: ReactNode;
  onBack: () => void;
  trailing?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-1 border-b border-[#E8E4DC] bg-[#FAFAF8]/95 px-2 py-1.5">
      <div className="justify-self-start">
        <button
          type="button"
          onClick={onBack}
          aria-label="بازگشت به صفحه اصلی"
          className="flex h-11 items-center gap-1 rounded-xl px-2.5 text-sm font-medium text-stone-700 transition duration-150 hover:bg-[#F5F3EF] hover:text-[#1C1917] active:bg-[#EDE9E3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          <CaretRight size={18} weight="bold" />
          <span>بازگشت</span>
        </button>
      </div>
      <h1 className="flex max-w-[12rem] items-center justify-center gap-1.5 text-sm font-semibold text-[#1C1917]">
        {icon}
        <span className="truncate">{title}</span>
      </h1>
      <div className="flex items-center justify-end gap-0.5 justify-self-end">
        {trailing}
      </div>
    </header>
  );
}

function HomePage({
  hotkey,
  status,
  onOpenSettings,
  onOpenHistory,
}: {
  hotkey: string;
  status: ShenavaStatus;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
}) {
  const active = status.models[status.activeModelKey];
  const modelMeta = SHENAVA_MODELS[status.activeModelKey];
  const modelReady = Boolean(active?.installed);

  return (
    <div className="flex h-full flex-col">
      <header className="px-3 pt-3 pb-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[#1C1917]">
          Persian Speach Type
        </h1>
        <p className="mt-0.5 text-xs text-stone-500">تایپ با صدا</p>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 pt-4 pb-5">
        <section
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-3.5 py-3.5",
            modelReady
              ? "border-orange-300/70 bg-orange-50"
              : "border-amber-300/70 bg-amber-50"
          )}
        >
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
              modelReady
                ? "bg-orange-100 text-orange-700"
                : "bg-amber-100 text-amber-700"
            )}
          >
            {modelReady ? (
              <CheckCircle size={22} weight="fill" />
            ) : (
              <WarningCircle size={22} weight="fill" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#1C1917]">
              {modelReady ? "مدل آماده گوش کردنه!" : "مدل نصب نشده"}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-stone-500">
              {modelReady
                ? modelMeta.shortName
                : "از تنظیمات یک مدل شنوا دانلود کنید"}
            </div>
          </div>
          {!modelReady && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="shrink-0 rounded-xl bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-white transition duration-150 hover:bg-[var(--color-primary-bright)] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              تنظیمات
            </button>
          )}
        </section>

        <section className="flex items-center gap-3 rounded-2xl border border-[#E8E4DC] bg-white px-3.5 py-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F5F3EF] text-stone-600">
            <Keyboard size={22} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#1C1917]">شورتکات سراسری</div>
            <div className="mt-0.5 text-xs text-stone-500">
              برای شروع و توقف ضبط فشار دهید
            </div>
          </div>
          <kbd className="rounded-lg border border-[#E8E4DC] bg-[#F5F3EF] px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wide text-orange-700">
            {hotkey}
          </kbd>
        </section>

        <nav className="grid gap-2" aria-label="صفحات برنامه">
          <NavRow
            icon={<GearSix size={22} weight="duotone" />}
            title="تنظیمات"
            subtitle="پرشین اسپیچ تایپ رو مدیریت کن"
            onClick={onOpenSettings}
          />
          <NavRow
            icon={<ClockCounterClockwise size={22} weight="duotone" />}
            title="تاریخچه"
            subtitle="متن‌های ضبط‌شده اخیر"
            onClick={onOpenHistory}
          />
        </nav>

        <p className="mt-auto pt-2 text-center text-[11px] leading-5 text-stone-400">
          با {hotkey} هرجا که دوست داری <s>تایپ کن</s> حرف بزن!
        </p>
      </div>
    </div>
  );
}

function NavRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-[#E8E4DC] bg-white px-3.5 py-3 text-right transition duration-150 hover:bg-[#F5F3EF] active:bg-[#EDE9E3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#1C1917]">{title}</span>
        <span className="mt-0.5 block text-xs text-stone-500">{subtitle}</span>
      </span>
      <CaretLeft
        size={16}
        weight="bold"
        className="shrink-0 text-stone-400"
        aria-hidden
      />
    </button>
  );
}

function ResultPage({
  text,
  onCopy,
  onClose,
  onBack,
}: {
  text: string;
  onCopy: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="متن آماده‌شده"
        onBack={onBack}
        trailing={
          <IconButton label="بستن" onClick={onClose}>
            <X size={18} />
          </IconButton>
        }
      />
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
        <p className="selectable max-h-64 flex-1 overflow-auto rounded-2xl border border-[#E8E4DC] bg-white p-3 text-sm leading-7 text-[#1C1917]">
          {text}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition duration-150 hover:bg-[var(--color-primary-bright)] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          <Copy size={16} />
          کپی متن
        </button>
      </div>
    </div>
  );
}

function ModelNeededPage({
  onOpenSettings,
  onBack,
  onClose,
}: {
  onOpenSettings: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="مدل تشخیص صدا پیدا نشد"
        onBack={onBack}
        trailing={
          <IconButton label="بستن" onClick={onClose}>
            <X size={18} />
          </IconButton>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm leading-7 text-stone-600">
          اگر نیمروز را دارید مدل‌هایش خودکار پیدا می‌شوند؛ در غیر این صورت از تنظیمات
          دانلود کنید.
        </p>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex min-h-11 items-center justify-center rounded-2xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition duration-150 hover:bg-[var(--color-primary-bright)] active:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          باز کردن تنظیمات
        </button>
      </div>
    </div>
  );
}

function statusBadge(modelStatus: ShenavaModelStatus, active: boolean) {
  if (modelStatus.phase === "downloading") {
    return {
      label: "در حال دانلود",
      className: "bg-orange-100 text-orange-800",
    };
  }
  if (modelStatus.phase === "error") {
    return {
      label: "خطا",
      className: "bg-red-100 text-red-700",
    };
  }
  if (modelStatus.installed && active) {
    return {
      label: modelStatus.source === "nimruz" ? "فعال · نیمروز" : "فعال",
      className: "bg-orange-100 text-orange-800",
    };
  }
  if (modelStatus.installed) {
    return {
      label: "آماده",
      className: "bg-[#F5F3EF] text-stone-600",
    };
  }
  return {
    label: "نصب‌نشده",
    className: "bg-[#F5F3EF] text-stone-500",
  };
}

function ShenavaModelCard({
  modelKey,
  status,
  downloading,
  onDownload,
  onCancelDownload,
  onSelect,
  onRevealPath,
}: {
  modelKey: ShenavaModelKey;
  status: ShenavaStatus;
  downloading: boolean;
  onDownload: (key: ShenavaModelKey) => void;
  onCancelDownload: () => void;
  onSelect: (key: ShenavaModelKey) => void;
  onRevealPath: (modelPath: string) => void;
}) {
  const model = SHENAVA_MODELS[modelKey];
  const modelStatus = status.models[modelKey];
  const active = status.activeModelKey === modelKey;
  const isDownloading = modelStatus.phase === "downloading";
  const isError = modelStatus.phase === "error";
  const sourceLabel = modelSourceLabel(modelStatus.source);
  const badge = statusBadge(modelStatus, active);
  const progress =
    modelStatus.totalBytes > 0
      ? Math.min(
          100,
          Math.round(
            (modelStatus.downloadedBytes / modelStatus.totalBytes) * 100
          )
        )
      : 0;
  const modelPath = modelStatus.path;

  return (
    <div
      className={cn(
        "rounded-2xl border px-3.5 py-3.5",
        active
          ? "border-orange-300 bg-orange-50"
          : isError
            ? "border-red-300 bg-red-50"
            : "border-[#E8E4DC] bg-white"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1C1917]">
              {model.displayName}
            </h3>
            {model.recommended && !active && !isDownloading && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
                پیشنهادی
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                badge.className
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-stone-500">
            {model.description}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {formatBytes(model.totalBytes)}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </p>
        </div>
      </div>

      {isDownloading && (
        <div className="mt-3 space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-[#E8E4DC]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-orange-700">
            <span>{formatPercent(progress)}</span>
            <span className="text-stone-500">
              {formatBytes(modelStatus.downloadedBytes)} /{" "}
              {formatBytes(modelStatus.totalBytes)}
            </span>
          </div>
        </div>
      )}

      {isError && modelStatus.error && (
        <p className="mt-2 text-xs leading-5 text-red-700">
          {modelStatus.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isDownloading ? (
          <button
            type="button"
            onClick={onCancelDownload}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 text-sm font-medium text-red-700 transition duration-150 hover:bg-red-100 active:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
          >
            <X size={15} weight="bold" />
            لغو
          </button>
        ) : modelStatus.installed ? (
          active ? (
            <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-orange-100 px-3.5 text-sm font-medium text-orange-800">
              <CheckCircle size={15} weight="fill" />
              فعال
            </span>
          ) : (
            <button
              type="button"
              disabled={downloading}
              onClick={() => onSelect(modelKey)}
              className="inline-flex min-h-10 items-center rounded-xl bg-[#F5F3EF] px-3.5 text-sm font-medium text-[#1C1917] transition duration-150 hover:bg-[#EDE9E3] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              انتخاب
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={downloading}
            onClick={() => onDownload(modelKey)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-3.5 text-sm font-medium text-white transition duration-150 hover:bg-[var(--color-primary-bright)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            <DownloadSimple size={15} weight="bold" />
            {isError ? "تلاش دوباره" : "دانلود"}
          </button>
        )}
      </div>

      {modelPath ? (
        <div className="mt-3 flex items-center gap-1.5 border-t border-[#E8E4DC] pt-2.5">
          <p
            dir="ltr"
            title={modelPath}
            className="min-w-0 flex-1 truncate text-left font-mono text-[11px] leading-4 text-stone-400"
          >
            {modelPath}
          </p>
          <button
            type="button"
            title="باز کردن در فایل‌اکسپلورر"
            aria-label="باز کردن در فایل‌اکسپلورر"
            onClick={() => onRevealPath(modelPath)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-orange-600 transition duration-150 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
          >
            <FolderOpen size={16} weight="bold" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function HotkeyCapture({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (accelerator: string) => void | Promise<void>;
}) {
  const [capturing, setCapturing] = useState(false);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!capturing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.repeat) return;

      if (event.key === "Escape") {
        setCapturing(false);
        return;
      }

      const bareEditKey =
        (event.key === "Backspace" || event.key === "Delete") &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey;

      if (bareEditKey) {
        setCapturing(false);
        void onCommitRef.current(DEFAULT_HOTKEY);
        return;
      }

      if (isModifierKey(event)) return;

      const accelerator = eventToAccelerator(event);
      if (!accelerator || !isValidAccelerator(accelerator)) return;

      setCapturing(false);
      void onCommitRef.current(accelerator);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing]);

  return (
    <button
      type="button"
      id="hotkey-input"
      aria-label="شورتکات سراسری"
      aria-pressed={capturing}
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border bg-white px-3 py-2 text-sm outline-none transition duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
        capturing
          ? "border-orange-400 text-stone-500 shadow-[0_0_0_3px_rgba(251,146,60,0.15)]"
          : "border-[#E8E4DC] text-[#1C1917] hover:border-orange-300/70"
      )}
    >
      <span
        className={cn(
          "min-w-0 truncate font-medium tracking-wide",
          capturing ? "text-stone-500" : "text-[#1C1917]"
        )}
        dir="ltr"
      >
        {capturing ? "کلید میانبر را بزنید…" : value}
      </span>
      <Keyboard
        size={18}
        weight={capturing ? "fill" : "regular"}
        className={cn(
          "shrink-0",
          capturing ? "text-orange-500" : "text-stone-400"
        )}
      />
    </button>
  );
}

function SettingsPage({
  settings,
  status,
  downloading,
  codexStatus,
  codexBusy,
  onBack,
  onSaveHotkey,
  onToggleLogin,
  onCorrectionProvider,
  onCodexLogin,
  onCodexRefresh,
  onCodexLogout,
  onDownload,
  onCancelDownload,
  onSelect,
  onRevealPath,
}: {
  settings: {
    hotkey: string;
    launchAtLogin: boolean;
    websiteUrl: string;
    correctionProvider: CorrectionProviderId;
  };
  status: ShenavaStatus;
  downloading: boolean;
  codexStatus: CodexAccountStatus | null;
  codexBusy: boolean;
  onBack: () => void;
  onSaveHotkey: (hotkey: string) => void | Promise<void>;
  onToggleLogin: (v: boolean) => void;
  onCorrectionProvider: (provider: CorrectionProviderId) => void;
  onCodexLogin: () => void;
  onCodexRefresh: () => void;
  onCodexLogout: () => void;
  onDownload: (key: ShenavaModelKey) => void;
  onCancelDownload: () => void;
  onSelect: (key: ShenavaModelKey) => void;
  onRevealPath: (modelPath: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="تنظیمات"
        icon={<GearSix size={16} weight="bold" />}
        onBack={onBack}
      />

      <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
        <section className="space-y-2">
          <label className="text-xs text-stone-500" htmlFor="hotkey-input">
            شورتکات سراسری
          </label>
          <HotkeyCapture value={settings.hotkey} onCommit={onSaveHotkey} />
          <p className="text-xs text-stone-500">
            کلیک کنید و کلیدها را بزنید · Esc لغو · Backspace پیش‌فرض ({DEFAULT_HOTKEY})
          </p>
        </section>

        <section className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8E4DC] bg-white px-3 py-3">
          <div className="min-w-0">
            <div className="text-sm text-[#1C1917]">اجرا با روشن شدن ویندوز</div>
            <div className="text-xs text-stone-500">در پس‌زمینه آماده بماند</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.launchAtLogin}
            aria-label="اجرا با روشن شدن ویندوز"
            onClick={() => onToggleLogin(!settings.launchAtLogin)}
            className={cn(
              "switch-track",
              settings.launchAtLogin ? "switch-track--on" : "switch-track--off"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "switch-thumb",
                settings.launchAtLogin ? "switch-thumb--on" : "switch-thumb--off"
              )}
            />
          </button>
        </section>

        <CorrectionSettingsSection
          correctionProvider={settings.correctionProvider}
          codexStatus={codexStatus}
          codexBusy={codexBusy}
          onCorrectionProvider={onCorrectionProvider}
          onCodexLogin={onCodexLogin}
          onCodexRefresh={onCodexRefresh}
          onCodexLogout={onCodexLogout}
        />

        <section className="space-y-2.5">
          <div className="text-xs text-stone-500">مدل شنوا</div>
          {(Object.keys(SHENAVA_MODELS) as ShenavaModelKey[]).map((key) => (
            <ShenavaModelCard
              key={key}
              modelKey={key}
              status={status}
              downloading={downloading}
              onDownload={onDownload}
              onCancelDownload={onCancelDownload}
              onSelect={onSelect}
              onRevealPath={onRevealPath}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function HistoryPage({
  items,
  onBack,
  onClear,
  onCopy,
}: {
  items: Array<{ id: string; text: string; createdAt: string }>;
  onBack: () => void;
  onClear: () => void;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="تاریخچه"
        icon={<ClockCounterClockwise size={16} weight="bold" />}
        onBack={onBack}
        trailing={
          items.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="flex h-11 items-center rounded-xl px-2.5 text-xs text-stone-500 transition duration-150 hover:bg-[#F5F3EF] hover:text-[#1C1917] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
            >
              پاک کردن
            </button>
          ) : null
        }
      />

      <div className="flex-1 overflow-auto px-4 py-3">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-stone-500">
            هنوز متنی ضبط نشده.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onCopy(item.text)}
                className="w-full rounded-2xl border border-[#E8E4DC] bg-white px-3 py-3 text-right transition duration-150 hover:bg-[#F5F3EF] active:bg-[#EDE9E3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
              >
                <div className="line-clamp-3 text-sm leading-6 text-[#1C1917]">
                  {item.text}
                </div>
                <div className="mt-1 text-[11px] text-stone-400">
                  {new Date(item.createdAt).toLocaleString("fa-IR")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
