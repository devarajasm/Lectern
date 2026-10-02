import { AnimatePresence, motion } from "motion/react";
import { Check, Cloud, Cpu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Providers } from "../api/client";
import { NARRATION_STYLES, SERVER_VOICES, type Settings } from "../settings";
import { AppearancePanel } from "./AppearancePanel";
import { VoicePreview } from "./VoicePreview";
import { browserSTTSupported, browserTTSSupported, listBrowserVoices } from "../voice/browserEngine";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  providers: Providers | null;
  onProviderChange: (body: { llm_provider?: string; speech_provider?: string }) => void;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-6 py-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1.5">
      <span>
        <span className="text-sm">{label}</span>
        {hint && <span className="block text-xs leading-relaxed text-ink-3">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function CapabilityRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${ok ? "text-ink-2" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
      <span className={`mt-1 size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span>
        <span className="font-medium">{label}:</span> {ok ? "cloud" : "browser (fallback)"}
        {!ok && detail && <span className="block opacity-80">{detail}. Create the deployment or fix AZURE_OPENAI_STT_DEPLOYMENT in .env.</span>}
      </span>
    </div>
  );
}

export function SettingsDrawer({ open, onClose, settings, onChange, providers, onProviderChange }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listBrowserVoices);
  useEffect(() => {
    if (!browserTTSSupported()) return;
    const update = () => setVoices(listBrowserVoices());
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);

  const [about, setAbout] = useState<{ version: string; license: string; source_url: string } | null>(null);
  useEffect(() => { if (open && !about) api.about().then(setAbout).catch(() => {}); }, [open, about]);

  const serverAvailable = providers?.speech.server_speech_available ?? false;
  const activeSpeech = providers?.speech.providers.find((p) => p.id === providers.speech.active);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="scrollbar-thin fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-card shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card/95 px-6 py-4 backdrop-blur">
              <h2 className="reading-text text-lg font-semibold">Settings</h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper-2" aria-label="Close"><X className="size-5" /></button>
            </div>

            <Section title="AI model provider" hint="Global for the whole app. Used to answer your questions about the book.">
              {!providers ? <p className="text-xs text-ink-3">Loading…</p> : (
                <div className="space-y-2">
                  {providers.llm.providers.map((p) => {
                    const active = providers.llm.active === p.id;
                    return (
                      <button key={p.id} onClick={() => onProviderChange({ llm_provider: p.id })}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${active ? "border-accent bg-accent-soft/60" : "border-line hover:bg-paper-2"}`}>
                        <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg ${p.kind === "local" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-sky-500/15 text-sky-600 dark:text-sky-400"}`}>
                          {p.kind === "local" ? <Cpu className="size-4" /> : <Cloud className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {p.label}
                            {!p.configured && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">not configured</span>}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-ink-3">{p.model}</span>
                          {p.detail && <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{p.detail}</span>}
                        </span>
                        {active && <Check className="mt-1 size-4 shrink-0 text-accent" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Voice engine" hint="Cloud voices sound more natural. The browser engine is free, local and the automatic fallback.">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-paper-2 p-1">
                {(["server", "browser"] as const).map((id) => (
                  <button key={id} onClick={() => onChange({ engine: id })}
                    className={`rounded-lg px-3 py-2 text-sm transition-colors ${settings.engine === id ? "bg-card font-medium shadow-sm" : "text-ink-2 hover:text-ink"}`}>
                    {id === "server" ? "Cloud voice" : "Browser voice"}
                  </button>
                ))}
              </div>
              {settings.engine === "server" && providers && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-ink-3">Cloud speech provider</label>
                  <select value={providers.speech.active} onChange={(e) => onProviderChange({ speech_provider: e.target.value })}
                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none">
                    {providers.speech.providers.map((p) => (
                      <option key={p.id} value={p.id} disabled={!p.configured}>{p.label}{p.configured ? "" : " (not configured)"}</option>
                    ))}
                  </select>
                  {activeSpeech && activeSpeech.id !== "none" && (
                    <p className="font-mono text-[11px] text-ink-3">STT {activeSpeech.stt_model} · TTS {activeSpeech.tts_model}</p>
                  )}
                  {!serverAvailable ? (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Cloud speech isn't available — using the browser engine instead.</p>
                  ) : (
                    <div className="space-y-1 text-xs">
                      <CapabilityRow label="Voice (text-to-speech)" ok={providers.speech.tts_available} detail={providers.speech.tts_detail} />
                      <CapabilityRow label="Listening (speech-to-text)" ok={providers.speech.stt_available} detail={providers.speech.stt_detail} />
                    </div>
                  )}
                  <label className="block pt-1 text-xs text-ink-3">Narrator voice</label>
                  <div className="flex gap-2">
                    <select value={settings.serverVoice} onChange={(e) => onChange({ serverVoice: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none">
                      {SERVER_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <VoicePreview engine="server" voice={settings.serverVoice} persona={settings.narrationStyle} disabled={!serverAvailable} />
                  </div>
                  <label className="block pt-2 text-xs text-ink-3">Narration style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {NARRATION_STYLES.map((st) => (
                      <button key={st.id} onClick={() => onChange({ narrationStyle: st.id })} title={st.hint}
                        className={`rounded-lg border px-2 py-2 text-left transition-colors ${settings.narrationStyle === st.id ? "border-accent bg-accent-soft/60" : "border-line hover:bg-paper-2"}`}>
                        <span className="block text-sm font-medium">{st.label}</span>
                        <span className="block text-[11px] leading-snug text-ink-3">{st.hint}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-ink-3">Books are read paragraph by paragraph for natural flow. Answers use a relaxed, conversational tone.</p>
                </div>
              )}
              {settings.engine === "browser" && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-ink-3">Browser voice</label>
                  <select value={settings.browserVoice} onChange={(e) => onChange({ browserVoice: e.target.value })}
                    className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none">
                    <option value="">Automatic (best available)</option>
                    {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} — {v.lang}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <VoicePreview engine="browser" voice={settings.browserVoice} />
                    <span className="text-[11px] text-ink-3">Tip: on macOS, “Premium”/“Enhanced” voices (System Settings → Accessibility → Spoken Content) sound far more natural.</span>
                  </div>
                  {!browserSTTSupported() && (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">This browser has no speech recognition. Use Chrome/Edge, cloud voice, or type your questions.</p>
                  )}
                </div>
              )}
            </Section>

            <Section title="Conversation">
              <Toggle checked={settings.bargeIn} onChange={(v) => onChange({ bargeIn: v })} label="Hands-free interruption"
                hint="Just start talking to interrupt the reading. Works best with headphones." />
              <Toggle checked={settings.askToContinue} onChange={(v) => onChange({ askToContinue: v })} label="Ask before resuming"
                hint="After answering, ask “Shall I continue?” and listen for your reply." />
            </Section>

            <Section title="Appearance" hint="Also available from the Aa button while reading.">
              <AppearancePanel value={settings} onChange={onChange} />
            </Section>

            <section className="px-6 py-5 text-xs leading-relaxed text-ink-3">
              <p className="font-medium text-ink-2">Keyboard</p>
              <p className="mt-1"><b>Space</b> interrupt / done speaking · <b>K</b> play / pause · <b>← →</b> previous / next sentence</p>
              <p className="mt-3 font-medium text-ink-2">Privacy</p>
              <p className="mt-1">Books, reading position and conversations are stored only in this app's local database. Questions send just the current and nearby passages to the selected AI provider — never the whole book. Local providers keep everything on this machine.</p>
              {about && (
                <p className="mt-4 border-t border-line pt-4">
                  Lectern v{about.version} · Free software under the{" "}
                  <a className="underline hover:text-ink" href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">GNU AGPL v3</a>
                  {about.source_url && (<> · <a className="underline hover:text-ink" href={about.source_url} target="_blank" rel="noreferrer">Source code</a></>)}
                </p>
              )}
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
