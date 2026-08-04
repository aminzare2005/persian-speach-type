import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type HistoryEntry = {
  id: string;
  text: string;
  createdAt: string;
};

const MAX_ENTRIES = 30;

function historyPath() {
  return path.join(app.getPath("userData"), "history.json");
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = readFileSync(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(text: string): HistoryEntry[] {
  const entry: HistoryEntry = {
    id: randomUUID(),
    text,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  const dir = path.dirname(historyPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(historyPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function clearHistory() {
  const dir = path.dirname(historyPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(historyPath(), "[]\n", "utf8");
}
