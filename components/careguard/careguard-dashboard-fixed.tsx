"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Activity,
  Camera,
  Check,
  CircleHelp,
  Eye,
  EyeOff,
  HeartPulse,
  Menu,
  MessageCircle,
  PhoneCall,
  RotateCcw,
  Settings2,
  Shield,
  Siren,
  Smile,
  Sparkles,
  Utensils,
} from "lucide-react";

type Tab = "overview" | "patient" | "vision" | "safety" | "communication";
type Command = "YES" | "NO" | "FOOD OR WATER" | "RESTROOM" | "PAIN" | "CALL CAREGIVER";
type Point = { x: number; y: number };

type FaceMesh = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (cb: (result: { multiFaceLandmarks?: Point[][] }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

declare global {
  interface Window {
    FaceMesh?: new (opts: { locateFile: (file: string) => string }) => FaceMesh;
  }
}

const navigation: Array<[Tab, string, typeof Activity]> = [
  ["overview", "Overview", Activity],
  ["patient", "Patient", Smile],
  ["vision", "Vision", Eye],
  ["safety", "Safety", Shield],
  ["communication", "Communication", MessageCircle],
];

const commands: Array<{ gesture: string; command: Command }> = [
  { gesture: "1× blink", command: "YES" },
  { gesture: "2× blink", command: "NO" },
  { gesture: "Look left", command: "FOOD OR WATER" },
  { gesture: "Look right", command: "RESTROOM" },
  { gesture: "Raise eyebrow", command: "PAIN" },
  { gesture: "Mouth movement", command: "CALL CAREGIVER" },
];

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const LEFT_EYE = { top: 159, bottom: 145, left: 130, right: 243 };
const RIGHT_EYE = { top: 386, bottom: 374, left: 263, right: 362 };
const LEFT_IRIS = { center: 468, a: 33, b: 133 };
const RIGHT_IRIS = { center: 473, a: 362, b: 263 };

function eyeRatio(face: Point[], eye: typeof LEFT_EYE) {
  const vertical = distance(face[eye.top], face[eye.bottom]);
  const horizontal = distance(face[eye.left], face[eye.right]);
  return horizontal > 0 ? vertical / horizontal : 0;
}

function faceHeight(face: Point[]) {
  return Math.max(0.0001, distance(face[10], face[152]));
}

function browLift(face: Point[]) {
  return (distance(face[105], face[159]) + distance(face[334], face[386])) / 2 / faceHeight(face);
}

function mouthOpening(face: Point[]) {
  return distance(face[13], face[14]) / faceHeight(face);
}

function irisPosition(face: Point[], eye: typeof LEFT_IRIS) {
  const center = face[eye.center];
  const a = face[eye.a];
  const b = face[eye.b];
  const min = Math.min(a.x, b.x);
  const max = Math.max(a.x, b.x);
  return Math.max(0, Math.min(1, (center.x - min) / Math.max(0.0001, max - min)));
}

function gazePosition(face: Point[]) {
  return (irisPosition(face, LEFT_IRIS) + irisPosition(face, RIGHT_IRIS)) / 2;
}

async function ensureFaceMesh() {
  if (window.FaceMesh) return window.FaceMesh;
  const current = document.querySelector<HTMLScriptElement>("script[data-careguard-face]");
  if (current) {
    await new Promise<void>((resolve, reject) => {
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener("error", () => reject(new Error("Vision engine failed to load.")), { once: true });
    });
    return window.FaceMesh;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
    script.async = true;
    script.dataset.careguardFace = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the browser vision engine."));
    document.head.appendChild(script);
  });
  return window.FaceMesh;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#111923] p-5"><p className="text-[11px] font-semibold tracking-[0.16em] text-slate-500">{label}</p><strong className="mt-3 block text-3xl font-semibold text-white">{value}</strong><span className="mt-2 block text-sm text-slate-400">{hint}</span></div>;
}

function Panel({ title, kicker, children, className = "" }: { title: string; kicker?: string; children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-white/10 bg-[#111923] p-5 ${className}`}><div className="mb-5"><h2 className="text-base font-semibold text-white">{title}</h2>{kicker && <span className="mt-1 block text-[10px] font-semibold tracking-[0.16em] text-slate-500">{kicker}</span>}</div>{children}</section>;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return <div className="flex items-center justify-between border-b border-white/5 py-3 text-sm last:border-b-0"><span className="text-slate-400">{label}</span><strong className={tone === "good" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-slate-100"}>{value}</strong></div>;
}

function HomeMap() {
  return <div className="relative h-[330px] rounded-xl bg-[#0a1119] p-5"><div className="grid h-full grid-cols-12 grid-rows-8 gap-3 text-[10px] font-semibold tracking-[0.12em] text-slate-500"><div className="col-span-6 row-span-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-3">BEDROOM</div><div className="col-span-5 col-start-8 row-span-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.03] p-3">KITCHEN</div><div className="col-span-6 row-span-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-3">LIVING ROOM</div><div className="col-span-2 col-start-8 row-span-2 rounded-xl border border-red-400/40 bg-red-400/[0.05] p-3">STAIRS</div><div className="col-span-3 col-start-10 row-span-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.03] p-3">BATHROOM</div></div><div className="absolute left-[30%] top-[34%] h-4 w-4 rounded-full bg-cyan-300 shadow-[0_0_25px_rgba(103,232,249,.8)]" /></div>;
}

export function CareGuardDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState<"standby" | "loading" | "live">("standby");
  const [face, setFace] = useState("Not found");
  const [gaze, setGaze] = useState("Center");
  const [eyeRatioState, setEyeRatioState] = useState("—");
  const [gesture, setGesture] = useState("Waiting for camera");
  const [lastCommand, setLastCommand] = useState<Command | "—">("—");
  const [blinkCount, setBlinkCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [timeline, setTimeline] = useState([{ time: "14:32", title: "MOVEMENT DETECTED", detail: "Bedroom → Living Room" }, { time: "14:18", title: "COMMUNICATION REQUEST", detail: "Patient requested water" }, { time: "13:57", title: "ENVIRONMENTAL SCAN", detail: "No hazards detected" }]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const rafRef = useRef<number | null>(null);
  const blinkTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const pendingBlinksRef = useRef(0);
  const lastBlinkAtRef = useRef(0);
  const eyesClosedRef = useRef(false);
  const closeFramesRef = useRef(0);
  const openFramesRef = useRef(0);
  const calibrationFramesRef = useRef(0);
  const gazeCandidateRef = useRef("CENTER");
  const gazeFramesRef = useRef(0);
  const browFramesRef = useRef(0);
  const mouthFramesRef = useRef(0);
  const browBaselineRef = useRef(0);
  const mouthBaselineRef = useRef(0);
  const browSamplesRef = useRef<number[]>([]);
  const mouthSamplesRef = useRef<number[]>([]);
  const lastCommandAtRef = useRef(0);

  const resetVision = useCallback(() => {
    if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current);
    blinkTimerRef.current = null;
    pendingBlinksRef.current = 0;
    lastBlinkAtRef.current = 0;
    eyesClosedRef.current = false;
    closeFramesRef.current = 0;
    openFramesRef.current = 0;
    calibrationFramesRef.current = 0;
    gazeCandidateRef.current = "CENTER";
    gazeFramesRef.current = 0;
    browFramesRef.current = 0;
    mouthFramesRef.current = 0;
    browBaselineRef.current = 0;
    mouthBaselineRef.current = 0;
    browSamplesRef.current = [];
    mouthSamplesRef.current = [];
    setBlinkCount(0);
    setFace("Not found");
    setGaze("Center");
    setEyeRatioState("—");
    setGesture(streamRef.current ? "Calibrating…" : "Waiting for camera");
  }, []);

  const announce = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
  }, []);

  const notifyTelegram = useCallback(async (command: Command, trigger: string) => {
    try {
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, trigger }) });
    } catch (error) {
      console.error("Telegram alert failed", error);
    }
  }, []);

  const setCommand = useCallback((command: Command, trigger: string) => {
    const now = performance.now();
    if (command === lastCommand && now - lastCommandAtRef.current < 1300) return;
    lastCommandAtRef.current = now;
    setLastCommand(command);
    setGesture(`${trigger} · ${command}`);
    setTimeline((items) => [{ time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), title: "COMMUNICATION REQUEST", detail: `${command} · ${trigger}` }, ...items].slice(0, 6));
    setToast(command === "CALL CAREGIVER" ? "Caregiver request sent" : `Command: ${command}`);
    announce(command);
    void notifyTelegram(command, trigger);
    window.setTimeout(() => setToast(null), 2400);
  }, [announce, lastCommand, notifyTelegram]);

  const handleResult = useCallback((result: { multiFaceLandmarks?: Point[][] }) => {
    const landmarks = result.multiFaceLandmarks?.[0];
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");
    if (!landmarks || !canvas || !video) {
      setFace("Not found");
      setGaze("—");
      setGesture("Move your face into view");
      context?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
      return;
    }
    setFace("Detected");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    context?.clearRect(0, 0, canvas.width, canvas.height);
    if (context) {
      context.fillStyle = "rgba(103,232,249,.9)";
      [159,145,130,243,386,374,263,362,468,473,105,334,13,14].forEach((index) => {
        const point = landmarks[index];
        if (!point) return;
        context.beginPath();
        context.arc(point.x * canvas.width, point.y * canvas.height, 2.5, 0, Math.PI * 2);
        context.fill();
      });
    }
    const ratio = (eyeRatio(landmarks, LEFT_EYE) + eyeRatio(landmarks, RIGHT_EYE)) / 2;
    const currentBrow = browLift(landmarks);
    const currentMouth = mouthOpening(landmarks);
    setEyeRatioState(ratio.toFixed(3));
    if (calibrationFramesRef.current < 45 && ratio > 0.22) {
      calibrationFramesRef.current += 1;
      browSamplesRef.current.push(currentBrow);
      mouthSamplesRef.current.push(currentMouth);
      if (calibrationFramesRef.current === 45) {
        browBaselineRef.current = browSamplesRef.current.reduce((a, b) => a + b, 0) / browSamplesRef.current.length;
        mouthBaselineRef.current = mouthSamplesRef.current.reduce((a, b) => a + b, 0) / mouthSamplesRef.current.length;
        setGesture("Calibration complete — perform a facial gesture");
      } else setGesture(`Calibrating facial baseline… ${Math.round(calibrationFramesRef.current / 45 * 100)}%`);
    }
    if (ratio < 0.18) {
      closeFramesRef.current += 1;
      openFramesRef.current = 0;
      if (closeFramesRef.current >= 2) { eyesClosedRef.current = true; setGesture("Eyes closed"); }
    } else if (ratio > 0.22) {
      openFramesRef.current += 1;
      closeFramesRef.current = 0;
      if (eyesClosedRef.current && openFramesRef.current >= 2 && performance.now() - lastBlinkAtRef.current > 350) {
        lastBlinkAtRef.current = performance.now();
        setBlinkCount((value) => value + 1);
        pendingBlinksRef.current += 1;
        if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current);
        if (pendingBlinksRef.current >= 2) {
          pendingBlinksRef.current = 0;
          setCommand("NO", "Two blinks");
        } else {
          blinkTimerRef.current = window.setTimeout(() => {
            if (pendingBlinksRef.current === 1) setCommand("YES", "One blink");
            pendingBlinksRef.current = 0;
          }, 850);
        }
        eyesClosedRef.current = false;
      }
    }
    if (calibrationFramesRef.current < 45) return;
    const horizontal = gazePosition(landmarks);
    const candidate = horizontal < 0.39 ? "LEFT" : horizontal > 0.61 ? "RIGHT" : "CENTER";
    setGaze(candidate === "LEFT" ? "Left" : candidate === "RIGHT" ? "Right" : "Center");
    gazeFramesRef.current = candidate === gazeCandidateRef.current ? gazeFramesRef.current + 1 : 0;
    gazeCandidateRef.current = candidate;
    if (gazeFramesRef.current >= 7 && performance.now() - lastCommandAtRef.current > 900) {
      if (candidate === "LEFT") setCommand("FOOD OR WATER", "Looking left");
      if (candidate === "RIGHT") setCommand("RESTROOM", "Looking right");
      gazeFramesRef.current = 0;
    }
    const browThreshold = browBaselineRef.current * 1.3 + 0.012;
    browFramesRef.current = currentBrow > browThreshold ? browFramesRef.current + 1 : Math.max(0, browFramesRef.current - 1);
    if (browFramesRef.current >= 8 && performance.now() - lastCommandAtRef.current > 1200) {
      browFramesRef.current = 0;
      setCommand("PAIN", "Raised eyebrow");
    }
    const mouthThreshold = Math.max(mouthBaselineRef.current + 0.018, 0.055);
    mouthFramesRef.current = currentMouth > mouthThreshold ? mouthFramesRef.current + 1 : Math.max(0, mouthFramesRef.current - 1);
    if (mouthFramesRef.current >= 8 && performance.now() - lastCommandAtRef.current > 1400) {
      mouthFramesRef.current = 0;
      setCommand("CALL CAREGIVER", "Mouth movement");
    }
  }, [setCommand]);

  const startCamera = useCallback(async () => {
    setCamera("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS.");
      const FaceMeshCtor = await ensureFaceMesh();
      if (!FaceMeshCtor) throw new Error("Vision engine did not initialize.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = media;
      if (!videoRef.current) throw new Error("Camera view is unavailable.");
      videoRef.current.srcObject = media;
      await videoRef.current.play();
      const detector = new FaceMeshCtor({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      detector.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      detector.onResults(handleResult);
      faceMeshRef.current = detector;
      resetVision();
      setGesture("Calibrating…");
      setCamera("live");
      const loop = async () => {
        if (!streamRef.current || !faceMeshRef.current || !videoRef.current) return;
        try { await faceMeshRef.current.send({ image: videoRef.current }); } catch (error) { console.error(error); }
        rafRef.current = window.requestAnimationFrame(() => void loop());
      };
      rafRef.current = window.requestAnimationFrame(() => void loop());
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCamera("standby");
      setToast(error instanceof Error ? error.message : "Unable to start camera.");
      window.setTimeout(() => setToast(null), 3200);
    }
  }, [handleResult, resetVision]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    faceMeshRef.current?.close?.();
    faceMeshRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("standby");
    resetVision();
  }, [resetVision]);

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    if (blinkTimerRef.current) window.clearTimeout(blinkTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    faceMeshRef.current?.close?.();
    window.speechSynthesis?.cancel();
  }, []);

  const pageMeta: Record<Tab, [string, string]> = { overview: ["Patient overview", "Sunday · September 13, 2026"], patient: ["Patient intelligence", "Personalized motor and behavioral profile"], vision: ["Vision intelligence", "Local facial gesture processing and camera-aware context"], safety: ["Home safety intelligence", "Contextual hazard reasoning across the camera-aware environment"], communication: ["Communication", "Patient interface · adaptive assistive commands"] };
  const [title, subtitle] = pageMeta[tab];

  return <div className="min-h-screen bg-[#080d13] text-white">
    <aside className={`fixed inset-y-0 left-0 z-40 w-[230px] border-r border-white/10 bg-[#0b1118] p-4 transition-transform lg:translate-x-0 ${menu ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center gap-2 border-b border-white/10 px-2 pb-5"><div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-300 to-violet-400 text-slate-900"><Sparkles size={15}/></div><div><strong className="block text-sm">CareGuard AI</strong><span className="text-[11px] text-emerald-400">● Systems operational</span></div></div>
      <nav className="mt-5 grid gap-1">{navigation.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => { setTab(id); setMenu(false); }} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${tab === id ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/20" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <div className="absolute bottom-5 left-4 right-4 grid gap-1"><button className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500"><Shield size={16}/>Privacy center</button><button className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500"><Settings2 size={16}/>Settings</button></div>
    </aside>
    <div className="lg:pl-[230px]">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[#080d13]/95 px-4 py-3 backdrop-blur lg:px-6"><div className="flex items-center gap-3"><button type="button" className="rounded-lg border border-white/10 p-2 lg:hidden" onClick={() => setMenu((value) => !value)} aria-label="Open navigation"><Menu size={18}/></button><div className="text-sm font-semibold lg:hidden">CareGuard AI</div></div><div className="ml-auto flex items-center gap-5 text-xs text-slate-400"><div><span className="block text-[9px] tracking-widest text-slate-600">CAMERA</span><span>{camera === "live" ? "🟢 Live" : camera === "loading" ? "🟡 Loading" : "🟠 Standby"}</span></div><div className="hidden sm:block"><span className="block text-[9px] tracking-widest text-slate-600">PROCESSING</span><span>Local</span></div><div className="hidden sm:block"><span className="block text-[9px] tracking-widest text-slate-600">CARE ENVIRONMENT</span><span className="text-emerald-400">● Active</span></div><span className="rounded-lg border border-violet-300/20 bg-violet-300/10 px-3 py-2 text-violet-100">◆ Demo mode</span></div></header>
      <main className="mx-auto max-w-[1400px] px-4 py-7 lg:px-7"><div className="mb-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">{title}</h1><p className="mt-2 text-sm text-slate-500">{subtitle} <span className="text-emerald-400">· AI systems operational</span></p></div><div className="text-right"><strong className="block text-sm">Alex Richardson</strong><span className="text-xs text-slate-500">Severe motor impairment · home monitoring active</span><span className="mt-2 inline-flex rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-400">SAFE</span></div></div>
        {tab === "overview" && <Overview timeline={timeline}/>} {tab === "patient" && <Patient/>} {tab === "vision" && <Vision video={videoRef} canvas={canvasRef} camera={camera} face={face} gaze={gaze} eye={eyeRatioState} gesture={gesture} lastCommand={lastCommand} blinkCount={blinkCount} start={startCamera} stop={stopCamera} reset={resetVision} test={setCommand}/>} {tab === "safety" && <Safety emergency={() => setCommand("CALL CAREGIVER", "Emergency protocol")}/>} {tab === "communication" && <Communication command={(value) => setCommand(value, "Patient interface")} emergency={() => setCommand("CALL CAREGIVER", "Emergency protocol")}/>} 
      </main>
    </div>
    {toast && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-[#101922] px-4 py-3 text-sm text-white shadow-2xl"><Check size={15} className="text-emerald-400"/>{toast}</div>}
  </div>;
}

function Overview({ timeline }: { timeline: Array<{ time: string; title: string; detail: string }> }) { return <div className="grid gap-5"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="SAFETY SCORE" value="92" hint="Low risk"/><Metric label="CURRENT ACTIVITY" value="Resting" hint="Bedroom · 14 min"/><Metric label="VISION CONFIDENCE" value="98.4%" hint="Live analysis"/><Metric label="COMMUNICATION" value="Ready" hint="Assistive input active"/></div><div className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]"><Panel title="Camera-aware home environment" kicker="DIGITAL TWIN"><HomeMap/><p className="mt-3 text-xs leading-5 text-slate-500">The laptop webcam establishes a camera-aware safety environment for the room it observes — not full-home coverage.</p></Panel><Panel title="AI risk engine"><Row label="Posture" value="Normal"/><Row label="Movement" value="Stable"/><Row label="Environment" value="Clear" tone="good"/><Row label="Restricted zone" value="Clear" tone="good"/><Row label="Fall probability" value="4%"/><Row label="Inactivity" value="Low"/><div className="mt-5 flex items-end gap-2"><span className="text-5xl font-semibold">8</span><span className="pb-2 text-sm text-slate-500">/100 · low risk</span></div></Panel></div><div className="grid gap-5 xl:grid-cols-2"><Panel title="Risk timeline"><div className="h-32 rounded-xl bg-[#0a1119] p-4"><svg viewBox="0 0 800 120" className="h-full w-full"><polyline points="5,85 70,88 135,84 200,87 265,82 330,86 395,84 460,87 525,83 590,86 655,84 720,87 795,84" fill="none" stroke="#67e8f9" strokeWidth="3"/></svg></div></Panel><Panel title="Live intelligence timeline">{timeline.map((event) => <div key={`${event.time}-${event.title}`} className="flex gap-3 border-b border-white/5 py-3 last:border-b-0"><span className="w-12 text-[11px] text-slate-600">{event.time}</span><span className="mt-1 size-2 rounded-full bg-emerald-400"/><div><strong className="block text-xs">{event.title}</strong><span className="text-xs text-slate-500">{event.detail}</span></div></div>)}</Panel></div></div>; }

function Patient() { const values = [["Eye gaze",96],["Left blink",91],["Right blink",72],["Eyebrow movement",84],["Head movement",93],["Mouth movement",43]]; return <div className="grid gap-5 xl:grid-cols-2"><Panel title="Patient motor profile">{values.map(([label,value]) => <div key={String(label)} className="mb-4"><div className="mb-2 flex justify-between text-xs"><span className="text-slate-400">{label}</span><strong>{value}%</strong></div><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-400" style={{width:`${value}%`}}/></div></div>)}<button className="mt-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5"><RotateCcw size={14} className="mr-2 inline"/>Run personalized calibration</button></Panel><Panel title="Personal baseline" kicker="DEVIATION, NOT DIAGNOSIS"><Row label="Facial symmetry" value="-3%" tone="warn"/><Row label="Gaze stability" value="-2%" tone="warn"/><Row label="Movement amplitude" value="-8%" tone="warn"/><Row label="Response time" value="+11%" tone="good"/><Row label="Activity pattern" value="-4%" tone="warn"/><p className="mt-4 text-xs leading-5 text-slate-500">Baseline comparisons are assistive indicators of change from the patient’s own historical pattern — never a medical diagnosis.</p></Panel><Panel title="Communication fatigue monitor"><Row label="Blink consistency" value="Stable"/><Row label="Gaze stability" value="Slight drift"/><Row label="Movement amplitude" value="Reduced"/><Row label="Response time" value="+340ms"/><span className="mt-4 inline-flex rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-semibold text-amber-300">MODERATE FATIGUE</span></Panel><Panel title="Typical day" kicker="BEHAVIORAL BASELINE"><Row label="07:30" value="Wake"/><Row label="08:15" value="Breakfast"/><Row label="10:30" value="Rest"/><Row label="12:45" value="Living room"/><Row label="14:00" value="Rest"/><Row label="22:30" value="Sleep"/></Panel></div>; }

function Vision({ video, canvas, camera, face, gaze, eye, gesture, lastCommand, blinkCount, start, stop, reset, test }: { video: RefObject<HTMLVideoElement | null>; canvas: RefObject<HTMLCanvasElement | null>; camera: "standby" | "loading" | "live"; face: string; gaze: string; eye: string; gesture: string; lastCommand: Command | "—"; blinkCount: number; start: () => void; stop: () => void; reset: () => void; test: (command: Command, trigger: string) => void }) { return <div className="grid gap-5"><div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]"><Panel title="Local vision session" kicker="BROWSER PROCESSING"><div className="relative aspect-video overflow-hidden rounded-xl bg-[#060b11]"><video ref={video} autoPlay playsInline muted className="h-full w-full object-cover"/><canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full"/>{camera !== "live" && <div className="absolute inset-0 grid place-items-center bg-black/30 text-center"><div><Camera className="mx-auto mb-3"/><strong className="block">{camera === "loading" ? "Starting vision engine…" : "Camera access required"}</strong><span className="mt-1 block text-xs text-slate-500">Use the camera to enable facial gesture commands.</span></div></div>}</div><div className="mt-4 flex flex-wrap gap-2">{camera === "live" ? <button className="rounded-xl border border-white/10 px-4 py-2 text-sm" onClick={stop}><EyeOff size={14} className="mr-2 inline"/>Stop camera</button> : <button className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950" onClick={start}><Camera size={14} className="mr-2 inline"/>Enable camera</button>}<button className="rounded-xl border border-white/10 px-4 py-2 text-sm" onClick={reset}><RotateCcw size={14} className="mr-2 inline"/>Reset calibration</button></div></Panel><Panel title="Facial controls"><div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] p-4"><span className="text-xs text-slate-500">Last command</span><strong className="mt-1 block text-2xl">{lastCommand}</strong><span className="mt-1 block text-xs text-slate-400">{gesture}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><Metric label="BLINKS" value={String(blinkCount)} hint="Detected"/><Metric label="EYE OPENNESS" value={eye} hint="Live ratio"/></div><div className="mt-3 grid grid-cols-2 gap-3"><Metric label="GAZE" value={gaze} hint="Direction"/><Metric label="FACE" value={face} hint="Tracking"/></div><div className="mt-4 grid gap-2">{commands.map((item) => <div key={item.gesture} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-xs"><span className="text-slate-400">{item.gesture}</span><strong>{item.command}</strong></div>)}</div></Panel></div><Panel title="Intent confirmation" kicker="ACCESSIBLE INPUT"><p className="mb-4 text-xs leading-5 text-slate-500">The same blink, gaze, eyebrow and mouth mappings from the prototype are available here for controlled manual testing.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{commands.map((item) => <button key={item.command} type="button" onClick={() => test(item.command, "Manual test")} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left text-sm transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.04]"><span className="block text-xs text-slate-500">{item.gesture}</span><strong>{item.command}</strong></button>)}</div></Panel></div>; }

function Safety({ emergency }: { emergency: () => void }) { return <div className="grid gap-5"><div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Panel title="Camera environment & zones"><HomeMap/><div className="mt-4 grid gap-2">{[["Kitchen","Moderate risk","text-amber-300"],["Stairs","High risk","text-red-300"],["Bathroom","Moderate risk","text-amber-300"],["Bedroom","Low risk","text-emerald-300"],["Living Room","Low risk","text-emerald-300"]].map(([name,risk,tone]) => <div className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm" key={name}><span><i className={`mr-2 inline-block size-2 rounded-full bg-current ${tone}`}/>{name}</span><span className="text-xs text-slate-500">{risk}</span></div>)}</div></Panel><div className="grid gap-5"><Panel title="Risk overview"><Row label="Overall risk" value="8/100" tone="good"/><Row label="Fall probability" value="4%"/><Row label="Inactivity" value="Low"/></Panel><Panel title="Why is this a risk?" kicker="EXPLAINABLE AI"><p className="border-b border-white/5 py-3 text-sm text-slate-400">✓ Patient detected</p><p className="border-b border-white/5 py-3 text-sm text-slate-400">✓ No restricted-zone proximity</p><p className="border-b border-white/5 py-3 text-sm text-slate-400">✓ No hazard objects active near patient</p><p className="py-3 text-sm text-slate-400">✓ Risk within personal baseline</p></Panel></div></div><div className="grid gap-5 xl:grid-cols-2"><Panel title="Pathway safety"><div className="rounded-xl bg-[#0a1119] p-8"><div className="relative h-2 rounded-full bg-white/10"><div className="h-full w-[42%] rounded-full bg-cyan-300"/><span className="absolute left-[58%] -top-3 grid size-8 place-items-center rounded-lg bg-red-400/70 font-bold">!</span></div><p className="mt-4 text-center text-xs tracking-wider text-emerald-400">ALTERNATIVE ROUTE · AVAILABLE</p></div></Panel><Panel title="Bathroom monitoring" kicker="PRIVACY-PRESERVING"><div className="grid place-items-center rounded-xl bg-[#0a1119] py-8 text-cyan-300"><Shield size={34}/><span className="mt-2 text-[10px] tracking-[0.16em] text-slate-500">PRIVACY SHIELD ACTIVE</span></div><Row label="Entry" value="10:42"/><Row label="Current duration" value="37 min"/><Row label="Expected" value="5–20 min"/><Row label="Movement" value="None detected"/><span className="mt-3 inline-flex rounded-full bg-amber-400/10 px-3 py-1 text-[10px] font-semibold text-amber-300">CHECK REQUIRED</span></Panel></div><div className="flex flex-col gap-3 rounded-2xl border border-red-300/10 bg-red-400/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between"><div><strong className="block">Emergency protocol</strong><span className="text-xs text-slate-500">Escalate, announce locally, and log the event.</span></div><button onClick={emergency} className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm text-red-100"><Siren size={14} className="mr-2 inline"/>Emergency</button></div></div>; }

function Communication({ command, emergency }: { command: (command: Command) => void; emergency: () => void }) { const cards: Array<[string, Command, typeof Activity]> = [["Water","FOOD OR WATER",Activity],["Food","FOOD OR WATER",Utensils],["Toilet","RESTROOM",Activity],["Pain","PAIN",HeartPulse],["Help","CALL CAREGIVER",CircleHelp],["Family","CALL CAREGIVER",PhoneCall]]; return <div className="grid gap-5"><Panel title="How can I help?" kicker="COMMUNICATION · TELEGRAM ALERTS ENABLED"><div className="mb-5 flex flex-wrap justify-center gap-6 text-xs text-slate-400"><span className="text-emerald-400">● Eye gaze active</span><span className="text-emerald-400">● Facial gesture active</span><span>Intent confidence <b className="text-white">91%</b></span></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(([label,value,Icon]) => <button key={label} onClick={() => command(value)} className="rounded-2xl border border-white/10 bg-[#0d151f] p-8 text-center transition hover:-translate-y-1 hover:border-cyan-300/20"><Icon size={26} className="mx-auto text-cyan-300"/><strong className="mt-4 block text-base">{label}</strong></button>)}</div><div className="mt-6 flex justify-center gap-3"><button onClick={emergency} className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm text-red-100">Emergency</button><button onClick={() => command("CALL CAREGIVER")} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Call caregiver</button></div></Panel><div className="grid gap-5 xl:grid-cols-2"><Panel title="Adaptive input"><Row label="Primary input" value="Eye gaze"/><Row label="Secondary input" value="Left-eye blink"/><Row label="Fatigue" value="Moderate"/><p className="mt-4 text-xs leading-5 text-slate-500">Controls simplify automatically as fatigue rises — from eye-gaze input to large category buttons.</p></Panel><Panel title="Intent confirmation"><Row label="Blink detected" value="51%"/><p className="mt-4 text-xs text-slate-500">Telegram alerts are dispatched server-side for each confirmed communication command.</p><button onClick={() => command("YES")} className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm">Repeat intentional blink</button></Panel></div></div>; }
