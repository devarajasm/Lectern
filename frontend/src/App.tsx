import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Providers } from "./api/client";
import { Library } from "./components/Library";
import { Reader } from "./components/Reader";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { Toaster, useToasts } from "./components/Toasts";
import { useAppearance } from "./appearance";
import type { ReadingStatus } from "./api/client";
import { Backdrop } from "./components/Backdrop";
import { useSettings } from "./settings";
import { VoiceManager } from "./voice/voiceManager";

function bookFromHash(): string | null {
  const m = window.location.hash.match(/^#\/book\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const [settings, updateSettings] = useSettings();
  useAppearance(settings);
  const [agentStatus, setAgentStatus] = useState<ReadingStatus | undefined>(undefined);
  const { toasts, notify, dismiss } = useToasts();
  const [bookId, setBookId] = useState<string | null>(bookFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [engineTick, setEngineTick] = useState(0);

  const prefsRef = useRef({ settings, providers });
  prefsRef.current = { settings, providers };

  const voice = useMemo(() => new VoiceManager(
    () => ({
      engine: prefsRef.current.settings.engine,
      serverTTSAvailable: prefsRef.current.providers?.speech.tts_available ?? false,
      serverSTTAvailable: prefsRef.current.providers?.speech.stt_available ?? false,
      serverVoice: prefsRef.current.settings.serverVoice,
      browserVoice: prefsRef.current.settings.browserVoice,
      persona: prefsRef.current.settings.narrationStyle,
    }),
    (kind, reason) => {
      const what = kind === "voice" ? "Cloud voice" : "Cloud speech recognition";
      const next = kind === "voice" ? "Using the browser voice." : "Switched to browser speech recognition. Please ask again; I'm listening.";
      notify(`${what} unavailable: ${reason.replace(/\.$/, "")}. ${next}`, "error");
      setEngineTick((t) => t + 1);
      api.providers().then(setProviders).catch(() => {}); // pick up the backend's updated status
    },
  ), [notify]);

  useEffect(() => {
    api.providers().then(setProviders).catch(() => notify("Could not reach the backend on port 8000.", "error"));
  }, [notify]);

  useEffect(() => {
    const onHash = () => setBookId(bookFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openBook = useCallback((id: string | null) => {
    window.location.hash = id ? `#/book/${id}` : "";
    setBookId(id);
  }, []);

  const changeSettings = (patch: Partial<typeof settings>) => {
    if (patch.engine) voice.resetFallback();
    updateSettings(patch);
  };

  const changeProviders = async (body: { llm_provider?: string; speech_provider?: string }) => {
    try {
      const next = await api.setProviders(body);
      setProviders(next);
      voice.resetFallback();
      if (body.llm_provider) {
        const p = next.llm.providers.find((x) => x.id === body.llm_provider);
        notify(`AI provider: ${p?.label ?? body.llm_provider}${p && !p.configured ? " (not configured yet)" : ""}`, p?.configured ? "info" : "error");
      }
    } catch (e) {
      notify((e as Error).message, "error");
    }
  };

  // Recomputed on settings/provider changes and after a fallback.
  const engineLabel = useMemo(() => {
    void engineTick;
    const { tts, stt } = voice.describe();
    const speech = providers?.speech.providers.find((p) => p.id === providers.speech.active)?.label ?? "Cloud";
    const name = (e: string) => (e === "server" ? speech : "Browser");
    const llm = providers?.llm.providers.find((p) => p.id === providers.llm.active)?.label ?? "";
    return `${tts === stt ? `Voice: ${name(tts)}` : `Voice: ${name(tts)} / Mic: ${name(stt)}`}${llm ? ` · AI: ${llm}` : ""}`;
  }, [voice, providers, settings.engine, engineTick]);

  return (
    <>
      <Backdrop ambience={settings.ambience} status={bookId ? agentStatus : undefined} />
      <div className="relative z-10 h-full">
      {bookId ? (
        <Reader key={bookId} bookId={bookId} voice={voice} settings={settings} engineLabel={engineLabel}
          onSettings={changeSettings} onBack={() => openBook(null)} onOpenSettings={() => setSettingsOpen(true)} notify={notify}
          onStatusChange={setAgentStatus} />
      ) : (
        <div className="scrollbar-thin h-full overflow-y-auto">
          <Library onOpen={openBook} onOpenSettings={() => setSettingsOpen(true)} notify={notify} />
        </div>
      )}
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onChange={changeSettings}
        providers={providers} onProviderChange={changeProviders} />
      <Toaster toasts={toasts} dismiss={dismiss} />
    </>
  );
}
