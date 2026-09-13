"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  HeartPulse,
  Menu,
  MessageCircle,
  Move3D,
  PhoneCall,
  RotateCcw,
  Settings2,
  Shield,
  Siren,
  Smile,
  Sparkles,
  Utensils,
} from "lucide-react";
import styles from "./careguard.module.css";

type Tab = "overview" | "patient" | "vision" | "safety" | "communication" | "alerts";
type Command = "YES" | "NO" | "FOOD OR WATER" | "RESTROOM" | "PAIN" | "CALL CAREGIVER";
type Point = { x: number; y: number };

type FaceMesh = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (cb: (result: { multiFaceLandmarks?: Point[][] }) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

declare global { interface Window { FaceMesh?: new (opts: { locateFile: (file: string) => string }) => FaceMesh } }

const navigation: Array<[Tab, string, typeof Activity]> = [
  ["overview", "Overview", Activity],
  ["patient", "Patient", Smile],
  ["vision", "Vision", Eye],
  ["safety", "Safety", Shield],
  ["communication", "Communication", MessageCircle],
  ["alerts", "Alerts", AlertTriangle],
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
  const h = distance(face[eye.top], face[eye.bottom]);
  const w = distance(face[eye.left], face[eye.right]);
  return w ? h / w : 0;
}
function faceHeight(face: Point[]) { return Math.max(0.0001, distance(face[10], face[152])); }
function brow(face: Point[]) { return (distance(face[105], face[159]) + distance(face[334], face[386])) / 2 / faceHeight(face); }
function mouth(face: Point[]) { return distance(face[13], face[14]) / faceHeight(face); }
function iris(face: Point[], eye: typeof LEFT_IRIS) {
  const center = face[eye.center];
  const a = face[eye.a];
  const b = face[eye.b];
  const min = Math.min(a.x, b.x);
  const max = Math.max(a.x, b.x);
  return Math.max(0, Math.min(1, (center.x - min) / Math.max(0.0001, max - min)));
}
function gaze(face: Point[]) { return (iris(face, LEFT_IRIS) + iris(face, RIGHT_IRIS)) / 2; }

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

function PanelTitle({ title, kicker, right }: { title: string; kicker?: string; right?: React.ReactNode }) {
  return <div className={styles.panelTitle}><div><h2>{title}</h2>{kicker && <span>{kicker}</span>}</div>{right}</div>;
}
function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warning" }) {
  return <div className={styles.row}><span>{label}</span><strong className={tone === "good" ? styles.good : tone === "warning" ? styles.warning : undefined}>{value}</strong></div>;
}
function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className={styles.metricCard}><span>{label}</span><strong>{value}</strong><em>{hint}</em></div>;
}
function HomeMap() {
  return <div className={styles.homeMap}>
    <div className={`${styles.room} ${styles.roomBedroom}`}><span>BEDROOM</span></div>
    <div className={`${styles.room} ${styles.roomKitchen}`}><span>KITCHEN</span></div>
    <div className={`${styles.room} ${styles.roomLiving}`}><span>LIVING ROOM</span></div>
    <div className={`${styles.room} ${styles.roomStairs}`}><span>STAIRS</span></div>
    <div className={`${styles.room} ${styles.roomBath}`}><span>BATHROOM</span></div>
    <div className={styles.mapPatient}><span /></div>
  </div>;
}
function Timeline({ events }: { events: Array<{ time: string; title: string; detail: string; confidence: string }> }) {
  return <div className={styles.timeline}>{events.map((e, i) => <div className={styles.timelineEvent} key={`${e.time}-${i}`}><span className={styles.timelineTime}>{e.time}</span><span className={`${styles.timelineDot} ${styles.timelineGood}`} /><div><strong>{e.title}</strong><span>{e.detail}</span><small>Confidence {e.confidence}</small></div></div>)}</div>;
}

export function CareGuardDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState<"standby" | "loading" | "live">("standby");
  const [face, setFace] = useState("Not found");
  const [gazeState, setGazeState] = useState("Center");
  const [eye, setEye] = useState("—");
  const [gesture, setGesture] = useState("Waiting for camera");
  const [lastCommand, setLastCommand] = useState<Command | "—">("—");
  const [blinkCount, setBlinkCount] = useState(0);
  const [alerts, setAlerts] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [events, setEvents] = useState([
    { time: "14:32", title: "MOVEMENT DETECTED", detail: "Bedroom → Living Room", confidence: "96%" },
    { time: "14:18", title: "COMMUNICATION REQUEST", detail: "Patient requested water", confidence: "94%" },
    { time: "13:57", title: "ENVIRONMENTAL SCAN", detail: "No hazards detected", confidence: "—" },
  ]);

  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mesh = useRef<FaceMesh | null>(null);
  const raf = useRef<number | null>(null);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlinks = useRef(0);
  const lastBlink = useRef(0);
  const closed = useRef(false);
  const closeFrames = useRef(0);
  const openFrames = useRef(0);
  const gazeCandidate = useRef("CENTER");
  const gazeFrames = useRef(0);
  const browFrames = useRef(0);
  const mouthFrames = useRef(0);
  const calibration = useRef(0);
  const browSamples = useRef<number[]>([]);
  const mouthSamples = useRef<number[]>([]);
  const browBaseline = useRef(0);
  const mouthBaseline = useRef(0);
  const lastAction = useRef(0);

  const resetVision = useCallback(() => {
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
    pendingBlinks.current = 0;
    closeFrames.current = 0;
    openFrames.current = 0;
    closed.current = false;
    gazeFrames.current = 0;
    browFrames.current = 0;
    mouthFrames.current = 0;
    calibration.current = 0;
    browSamples.current = [];
    mouthSamples.current = [];
    browBaseline.current = 0;
    mouthBaseline.current = 0;
    setBlinkCount(0);
    setFace("Not found");
    setGazeState("Center");
    setEye("—");
    setGesture("Waiting for camera");
  }, []);

  const announce = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.rate = 0.9;
    window.speechSynthesis.speak(speech);
  }, []);

  const trigger = useCallback((command: Command, source: string) => {
    const now = performance.now();
    if (now - lastAction.current < 700) return;
    lastAction.current = now;
    setLastCommand(command);
    setGesture(`${source} · ${command}`);
    setEvents((items) => [{ time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }), title: "COMMUNICATION REQUEST", detail: `${command} · ${source}`, confidence: "91%" }, ...items].slice(0, 6));
    setToast(command === "CALL CAREGIVER" ? "Caregiver request created" : `Command: ${command}`);
    announce(command);
    window.setTimeout(() => setToast(null), 2200);
  }, [announce]);

  const handleResult = useCallback((result: { multiFaceLandmarks?: Point[][] }) => {
    const landmarks = result.multiFaceLandmarks?.[0];
    const ctx = canvas.current?.getContext("2d");
    if (!landmarks || !canvas.current || !video.current) {
      setFace("Not found");
      setGazeState("—");
      setGesture("Move your face into view");
      ctx?.clearRect(0, 0, canvas.current?.width ?? 0, canvas.current?.height ?? 0);
      return;
    }
    setFace("Detected");
    if (ctx) {
      canvas.current.width = video.current.videoWidth || 1280;
      canvas.current.height = video.current.videoHeight || 720;
      ctx.clearRect(0, 0, canvas.current.width, canvas.current.height);
      ctx.fillStyle = "rgba(105,226,221,.9)";
      [159,145,130,243,386,374,263,362,468,473,105,334,13,14].forEach((id) => {
        const p = landmarks[id];
        if (!p) return;
        ctx.beginPath();
        ctx.arc(p.x * canvas.current!.width, p.y * canvas.current!.height, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    const ratio = (eyeRatio(landmarks, LEFT_EYE) + eyeRatio(landmarks, RIGHT_EYE)) / 2;
    const currentBrow = brow(landmarks);
    const currentMouth = mouth(landmarks);
    setEye(ratio.toFixed(3));

    if (calibration.current < 45 && ratio > 0.22) {
      calibration.current += 1;
      browSamples.current.push(currentBrow);
      mouthSamples.current.push(currentMouth);
      if (calibration.current === 45) {
        browBaseline.current = browSamples.current.reduce((a, b) => a + b, 0) / browSamples.current.length;
        mouthBaseline.current = mouthSamples.current.reduce((a, b) => a + b, 0) / mouthSamples.current.length;
        setGesture("Calibration complete — perform a facial gesture");
      } else setGesture(`Calibrating facial baseline… ${Math.round(calibration.current / 45 * 100)}%`);
    }

    if (ratio < 0.18) {
      closeFrames.current += 1;
      openFrames.current = 0;
      if (closeFrames.current >= 2) { closed.current = true; setGesture("Eyes closed"); }
    } else if (ratio > 0.22) {
      openFrames.current += 1;
      closeFrames.current = 0;
      if (closed.current && openFrames.current >= 2 && performance.now() - lastBlink.current > 350) {
        lastBlink.current = performance.now();
        setBlinkCount((value) => value + 1);
        pendingBlinks.current += 1;
        if (blinkTimer.current) clearTimeout(blinkTimer.current);
        if (pendingBlinks.current >= 2) {
          pendingBlinks.current = 0;
          trigger("NO", "Two blinks");
        } else blinkTimer.current = window.setTimeout(() => { if (pendingBlinks.current === 1) trigger("YES", "One blink"); pendingBlinks.current = 0; }, 850);
        closed.current = false;
      }
    }

    if (calibration.current < 45) return;
    const horizontal = gaze(landmarks);
    const candidate = horizontal < 0.39 ? "LEFT" : horizontal > 0.61 ? "RIGHT" : "CENTER";
    setGazeState(candidate === "LEFT" ? "Left" : candidate === "RIGHT" ? "Right" : "Center");
    gazeFrames.current = candidate === gazeCandidate.current ? gazeFrames.current + 1 : 0;
    gazeCandidate.current = candidate;
    if (gazeFrames.current >= 7 && performance.now() - lastAction.current > 900) {
      if (candidate === "LEFT") trigger("FOOD OR WATER", "Looking left");
      if (candidate === "RIGHT") trigger("RESTROOM", "Looking right");
      gazeFrames.current = 0;
    }

    const browThreshold = browBaseline.current * 1.3 + 0.012;
    browFrames.current = currentBrow > browThreshold ? browFrames.current + 1 : Math.max(0, browFrames.current - 1);
    if (browFrames.current >= 8 && performance.now() - lastAction.current > 1200) {
      browFrames.current = 0;
      trigger("PAIN", "Raised eyebrow");
    }
    const mouthThreshold = Math.max(mouthBaseline.current + 0.018, 0.055);
    mouthFrames.current = currentMouth > mouthThreshold ? mouthFrames.current + 1 : Math.max(0, mouthFrames.current - 1);
    if (mouthFrames.current >= 8 && performance.now() - lastAction.current > 1400) {
      mouthFrames.current = 0;
      trigger("CALL CAREGIVER", "Mouth movement");
    }
  }, [trigger]);

  const startCamera = useCallback(async () => {
    setCamera("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS.");
      const FaceMeshCtor = await ensureFaceMesh();
      if (!FaceMeshCtor) throw new Error("Vision engine did not initialize.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      stream.current = media;
      if (!video.current) throw new Error("Camera view is unavailable.");
      video.current.srcObject = media;
      await video.current.play();
      const detector = new FaceMeshCtor({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      detector.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      detector.onResults(handleResult);
      mesh.current = detector;
      resetVision();
      setGesture("Calibrating…");
      setCamera("live");
      const run = async () => {
        if (!stream.current || !mesh.current || !video.current) return;
        try { await mesh.current.send({ image: video.current }); } catch (error) { console.error(error); }
        raf.current = requestAnimationFrame(() => void run());
      };
      raf.current = requestAnimationFrame(() => void run());
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      setCamera("standby");
      setToast(error instanceof Error ? error.message : "Unable to start camera.");
      window.setTimeout(() => setToast(null), 3200);
    }
  }, [handleResult, resetVision]);

  const stopCamera = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    mesh.current?.close?.();
    mesh.current = null;
    if (video.current) video.current.srcObject = null;
    canvas.current?.getContext("2d")?.clearRect(0, 0, canvas.current?.width ?? 0, canvas.current?.height ?? 0);
    setCamera("standby");
    resetVision();
  }, [resetVision]);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (blinkTimer.current) clearTimeout(blinkTimer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    mesh.current?.close?.();
    window.speechSynthesis?.cancel();
  }, []);

  const pageMeta: Record<Tab, [string, string]> = {
    overview: ["Patient overview", "Sunday · September 13, 2026"],
    patient: ["Patient intelligence", "Personalized motor and behavioral profile"],
    vision: ["Vision intelligence", "Local facial gesture processing and camera-aware context"],
    safety: ["Home safety intelligence", "Contextual hazard reasoning across the camera-aware environment"],
    communication: ["Communication", "Patient interface · adapts to fatigue and motor capability"],
    alerts: ["Alerts & incidents", "Explainable, event-linked incident management"],
  };
  const [title, subtitle] = pageMeta[tab];

  return <div className={styles.app}>
    <aside className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}>
      <div className={styles.brand}><div className={styles.brandMark}><Sparkles size={15} /></div><span>CareGuard AI</span><span className={styles.onlineDot} /><span className={styles.systemText}>Systems operational</span></div>
      <nav className={styles.nav}>{navigation.map(([id, label, Icon]) => <button key={id} type="button" className={`${styles.navItem} ${tab === id ? styles.navActive : ""}`} onClick={() => { setTab(id); setMenu(false); }}><Icon size={17} /><span>{label}</span>{id === "alerts" && <span className={styles.navBadge}>{String(alerts).padStart(2, "0")}</span>}</button>)}</nav>
      <div className={styles.sidebarBottom}><button type="button" className={styles.utilityItem}><Shield size={16} /><span>Privacy center</span></button><button type="button" className={styles.utilityItem}><Settings2 size={16} /><span>Settings</span></button></div>
    </aside>
    <div className={styles.mobileMenuBar}><button type="button" className={styles.iconButton} onClick={() => setMenu((value) => !value)} aria-label="Open navigation"><Menu size={20} /></button><span>CareGuard AI</span><span className={styles.mobileStatus}><span className={styles.onlineDot} /> Live</span></div>
    <main className={styles.main}>
      <header className={styles.topbar}><div className={styles.topbarLeft}><div className={styles.brandDesktop}><div className={styles.brandMark}><Sparkles size={15} /></div><strong>CareGuard AI</strong><span className={styles.onlineDot} /><span>Systems operational</span></div></div><div className={styles.topMeta}><div><small>CAMERA</small><span className={styles.stateText}><span className={`${styles.stateDot} ${camera === "live" ? styles.stateLive : styles.stateStandby}`} />{camera === "live" ? "Live" : camera === "loading" ? "Loading" : "Standby"}</span></div><div><small>PROCESSING</small><span>Local</span></div><div><small>CARE ENVIRONMENT</small><span className={styles.stateText}><span className={`${styles.stateDot} ${styles.stateLive}`} />Active</span></div><button type="button" className={styles.demoPill}>◆ Demo mode</button></div></header>
      <div className={styles.page}>
        <div className={styles.pageHeading}><div><h1>{title}</h1><p>{subtitle} <span className={styles.inlineStatus}>● AI systems operational</span></p></div><div className={styles.patientSummary}><strong>Alex Richardson</strong><span>Severe motor impairment · home monitoring active</span><em>SAFE</em></div></div>
        {tab === "overview" && <Overview events={events} />}
        {tab === "patient" && <Patient />}
        {tab === "vision" && <Vision video={video} canvas={canvas} camera={camera} face={face} gaze={gazeState} eye={eye} gesture={gesture} lastCommand={lastCommand} blinkCount={blinkCount} start={startCamera} stop={stopCamera} reset={resetVision} test={trigger} />}
        {tab === "safety" && <Safety emergency={() => trigger("CALL CAREGIVER", "Emergency protocol")} />}
        {tab === "communication" && <Communication command={(value) => trigger(value, "Patient interface")} emergency={() => trigger("CALL CAREGIVER", "Emergency protocol")} />}
        {tab === "alerts" && <Alerts events={events} alerts={alerts} acknowledge={() => { setAlerts((value) => Math.max(0, value - 1)); setToast("Alert acknowledged"); window.setTimeout(() => setToast(null), 1800); }} />}
        <footer className={styles.footer}>CareGuard AI — Assistive technology prototype. Vision intelligence processed locally where supported. Prototype — not a medical diagnostic system.</footer>
      </div>
    </main>
    {toast && <div className={styles.toast} role="status"><Check size={15} />{toast}</div>}
    {menu && <button className={styles.sidebarBackdrop} type="button" aria-label="Close navigation" onClick={() => setMenu(false)} />}
  </div>;
}

function Overview({ events }: { events: Array<{ time: string; title: string; detail: string; confidence: string }> }) {
  return <><section className={styles.metricGrid}><Metric label="SAFETY SCORE" value="92/100" hint="Low risk" /><Metric label="CURRENT ACTIVITY" value="Resting" hint="Bedroom · 14 min" /><Metric label="VISION CONFIDENCE" value="98.4%" hint="Live analysis" /><Metric label="ACTIVE ALERTS" value="01" hint="Low priority" /></section><section className={`${styles.splitGrid} ${styles.overviewSplit}`}><div className={styles.panel}><PanelTitle title="Camera-aware home environment" kicker="DIGITAL TWIN" /><HomeMap /><div className={styles.legend}><span><i className={styles.safeSwatch} />Safe zone</span><span><i className={styles.restrictedSwatch} />Restricted zone</span><span><i className={styles.hazardSwatch} />Hazard zone</span></div><p className={styles.note}>The laptop webcam establishes a camera-aware safety environment for the room it observes — not full-home coverage.</p></div><div className={styles.panel}><PanelTitle title="AI risk engine" /><div className={styles.riskEngine}><div className={styles.riskRing}><strong>8</strong><span>/100</span><em>LOW RISK</em></div><div className={styles.riskRows}><Row label="Posture" value="Normal" /><Row label="Movement" value="Stable" /><Row label="Environment" value="Clear" /><Row label="Restricted zone" value="Clear" /><Row label="Fall probability" value="4%" /><Row label="Inactivity" value="Low" /></div></div></div></section><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Risk timeline" right={<div className={styles.segmented}><button className={styles.segmentActive}>6H</button><button>12H</button><button>24H</button></div>} /><div className={styles.chartWrap}><svg viewBox="0 0 820 150" role="img" aria-label="Risk trend"><line x1="10" y1="100" x2="810" y2="100" stroke="rgba(242,173,90,.25)" strokeDasharray="6 6" /><polyline points="8,118 70,120 132,117 194,119 256,116 318,119 380,117 442,118 504,116 566,118 628,117 690,119 752,117 814,118" fill="none" stroke="currentColor" strokeWidth="3" className={styles.chartLine} /></svg></div></div><div className={styles.panel}><PanelTitle title="Live intelligence timeline" /><Timeline events={events} /></div></section></>;
}

function Patient() {
  const values = [["Eye gaze",96],["Left blink",91],["Right blink",72],["Eyebrow movement",84],["Head movement",93],["Mouth movement",43]];
  return <><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Patient motor profile" /><div className={styles.profileBars}>{values.map(([label,value]) => <div key={String(label)}><div className={styles.barLabel}><span>{label}</span><strong>{value}%</strong></div><div className={styles.barTrack}><span style={{width:`${value}%`}} /></div></div>)}</div><button className={styles.secondaryButton} type="button"><RotateCcw size={14} /> Run personalized calibration</button></div><div className={styles.panel}><PanelTitle title="Personal baseline" kicker="DEVIATION, NOT DIAGNOSIS" /><Row label="Facial symmetry" value="-3%" tone="warning" /><Row label="Gaze stability" value="-2%" tone="warning" /><Row label="Movement amplitude" value="-8%" tone="warning" /><Row label="Response time" value="+11%" tone="good" /><Row label="Activity pattern" value="-4%" tone="warning" /><p className={styles.explanation}>Movement amplitude is 8% below personal baseline. This is a deviation from Alex&apos;s own historical pattern — not a medical diagnosis.</p></div></section><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Communication fatigue monitor" /><Row label="Blink consistency" value="Stable" /><Row label="Gaze stability" value="Slight drift" /><Row label="Movement amplitude" value="Reduced" /><Row label="Response time" value="+340ms" /><div className={styles.miniChart}><svg viewBox="0 0 500 100" preserveAspectRatio="none"><polyline points="0,72 80,70 160,65 240,59 320,56 400,42 500,37" fill="none" stroke="currentColor" strokeWidth="3" className={styles.fatigueLine} /></svg></div><span className={styles.warningPill}>MODERATE FATIGUE</span></div><div className={styles.panel}><PanelTitle title="Typical day" kicker="BEHAVIORAL BASELINE" />{[["07:30","Wake"],["08:15","Breakfast"],["10:30","Rest"],["12:45","Living room"],["14:00","Rest"],["22:30","Sleep"]].map(([time,label]) => <div className={styles.row} key={time}><span>{time}</span><strong>{label}</strong></div>)}<p className={styles.explanation}>Today&apos;s inactivity is currently within expected range for this time of day.</p></div></section></>;
}

function Vision({ video, canvas, camera, face, gaze, eye, gesture, lastCommand, blinkCount, start, stop, reset, test }: { video: RefObject<HTMLVideoElement | null>; canvas: RefObject<HTMLCanvasElement | null>; camera: "standby" | "loading" | "live"; face: string; gaze: string; eye: string; gesture: string; lastCommand: Command | "—"; blinkCount: number; start: () => void; stop: () => void; reset: () => void; test: (command: Command, source: string) => void }) {
  return <><section className={styles.splitGrid}><div className={`${styles.panel} ${styles.cameraPanel}`}><PanelTitle title="Local vision session" kicker="BROWSER PROCESSING" right={<span className={styles.privacyTag}><Shield size={13} />Frames stay in the browser</span>} /><div className={styles.videoFrame}><video ref={video} autoPlay playsInline muted /><canvas ref={canvas} />{camera !== "live" && <div className={styles.cameraPlaceholder}><Camera size={28} /><strong>{camera === "loading" ? "Starting vision engine…" : "Camera access required"}</strong><span>Use the camera to enable facial gesture commands.</span></div>}{camera === "live" && <div className={styles.liveBadge}><span className={`${styles.stateDot} ${styles.stateLive}`} /> Vision live</div>}</div><div className={styles.cameraActions}>{camera === "live" ? <button className={styles.secondaryButton} type="button" onClick={stop}><EyeOff size={14}/> Stop camera</button> : <button className={styles.primaryButton} type="button" onClick={start}><Camera size={14}/> Enable camera</button>}<button className={styles.secondaryButton} type="button" onClick={reset}><RotateCcw size={14}/> Reset calibration</button></div></div><div className={styles.panel}><PanelTitle title="Facial controls" /><div className={styles.commandCard}><span>Last command</span><strong>{lastCommand}</strong><small>{gesture}</small></div><div className={styles.metricRowTwo}><div className={styles.smallMetric}><span>Blinks detected</span><strong>{blinkCount}</strong></div><div className={styles.smallMetric}><span>Eye openness</span><strong>{eye}</strong></div></div><div className={styles.metricRowTwo}><div className={styles.smallMetric}><span>Gaze</span><strong>{gaze}</strong></div><div className={styles.smallMetric}><span>Face</span><strong>{face}</strong></div></div><div className={styles.gestureState}>{gesture}</div><div className={styles.gestureMap}>{commands.map((item) => <div className={styles.gestureItem} key={item.gesture}><span>{item.gesture}</span><strong>{item.command}</strong></div>)}</div></div></section><section className={styles.panel}><PanelTitle title="Intent confirmation" kicker="ACCESSIBLE INPUT" /><p className={styles.note}>The gesture engine uses the source prototype&apos;s blink timing, gaze persistence, normalized eyebrow/mouth thresholds, and a 45-frame per-session baseline.</p><div className={styles.commandButtons}>{commands.map((item) => <button key={item.command} type="button" onClick={() => test(item.command, "Manual test")}>{item.command}</button>)}</div></section></>;
}

function Safety({ emergency }: { emergency: () => void }) {
  return <><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Camera environment & zones" /><HomeMap /><div className={styles.zoneList}>{[["Kitchen","Moderate risk","moderate"],["Stairs","High risk","high"],["Bathroom","Moderate risk","moderate"],["Bedroom","Low risk","low"],["Living Room","Low risk","low"]].map(([name,risk,tone]) => <div className={styles.zoneItem} key={name}><span><i className={`${styles.zoneDot} ${tone === "high" ? styles.zoneHigh : tone === "moderate" ? styles.zoneModerate : styles.zoneLow}`} />{name}</span><small>{risk}</small><div><button type="button">Edit</button><button type="button">Delete</button></div></div>)}</div><button className={styles.secondaryButton} type="button"><ChevronRight size={14}/> Create zone</button></div><div className={styles.sideStack}><div className={styles.panel}><PanelTitle title="Risk overview" /><Row label="Overall risk" value="8/100" tone="good"/><Row label="Fall probability" value="4%"/><Row label="Inactivity" value="Low"/></div><div className={styles.panel}><PanelTitle title="Why is this a risk?" kicker="EXPLAINABLE AI"/><div className={styles.checkList}><p><Check size={14}/>Patient detected</p><p><Check size={14}/>No restricted-zone proximity</p><p><Check size={14}/>No hazard objects active near patient</p><p><Check size={14}/>Risk within personal baseline</p></div></div></div></section><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Pathway safety"/><div className={styles.pathway}><div className={styles.pathTrack}><span className={styles.pathProgress}/><span className={styles.obstacle}>!</span><div className={styles.pathLabel}>OBSTACLE · 1.3m</div><div className={styles.detour}>ALTERNATIVE ROUTE · AVAILABLE</div></div></div></div><div className={styles.panel}><PanelTitle title="Bathroom monitoring" kicker="PRIVACY-PRESERVING"/><div className={styles.privacyBox}><Shield size={30}/><span>PRIVACY SHIELD ACTIVE</span></div><Row label="Entry" value="10:42"/><Row label="Current duration" value="37 min"/><Row label="Expected" value="5–20 min"/><Row label="Movement" value="None detected"/><span className={styles.warningPill}>CHECK REQUIRED</span></div></section><section className={styles.emergencyStrip}><div><strong>Emergency protocol</strong><span>Escalate, announce locally, and log the event.</span></div><button className={styles.emergencyButton} type="button" onClick={emergency}><Siren size={14}/> Emergency</button></section></>;
}

function Communication({ command, emergency }: { command: (value: Command) => void; emergency: () => void }) {
  const cards: Array<[string, Command, typeof Activity]> = [["Water","FOOD OR WATER",Activity],["Food","FOOD OR WATER",Utensils],["Toilet","RESTROOM",Activity],["Pain","PAIN",HeartPulse],["Help","CALL CAREGIVER",CircleHelp],["Family","CALL CAREGIVER",PhoneCall]];
  return <><section className={styles.communicationHero}><div className={styles.communicationHeading}><h2>How can I help?</h2><div><span><i className={styles.stateDot}/> Eye gaze active</span><span><i className={styles.stateDot}/> Facial gesture active</span><strong>Intent confidence <b>91%</b></strong></div></div><div className={styles.communicationGrid}>{cards.map(([label,value,Icon]) => <button key={label} type="button" onClick={() => command(value)}><Icon size={25}/><strong>{label}</strong></button>)}</div><div className={styles.commFooter}><button className={styles.emergencyButton} type="button" onClick={emergency}>Emergency</button><button className={styles.secondaryButton} type="button" onClick={() => command("CALL CAREGIVER")}>Call caregiver</button></div></section><section className={styles.splitGrid}><div className={styles.panel}><PanelTitle title="Adaptive input"/><Row label="Primary input" value="Eye gaze"/><Row label="Secondary input" value="Left-eye blink"/><Row label="Fatigue" value="Moderate"/><p className={styles.note}>Controls simplify as fatigue rises — from an eye-gaze keyboard to large category buttons to a 3-option interface.</p></div><div className={styles.panel}><PanelTitle title="Intentional vs involuntary movement"/><Row label="Blink detected" value="51%"/><p className={styles.explanation}>System waiting for confirmation…</p><button className={styles.secondaryButton} type="button" onClick={() => command("YES")}>Repeat intentional blink</button></div></section></>;
}

function Alerts({ events, alerts, acknowledge }: { events: Array<{ time: string; title: string; detail: string; confidence: string }>; alerts: number; acknowledge: () => void }) {
  return <section className={styles.alertsStack}><p className={styles.sectionLabel}>WARNING</p>{events.slice(0, Math.max(1, alerts)).map((event) => <div className={styles.alertCard} key={`${event.time}-${event.title}`}><div className={styles.alertIcon}><AlertTriangle size={17}/></div><div className={styles.alertContent}><strong>{event.title === "COMMUNICATION REQUEST" ? "Communication request" : "Hazard detected"}</strong><span>{event.time} · {event.detail}</span><div><button type="button">View event</button><button type="button">View camera</button><button type="button" onClick={acknowledge}>Acknowledge</button></div></div></div>)}<p className={styles.sectionLabel}>RESOLVED</p><div className={`${styles.alertCard} ${styles.resolved}`}><div className={styles.resolvedIcon}><Check size={16}/></div><div className={styles.alertContent}><strong>Environmental scan complete</strong><span>13:57 · No hazards detected</span></div></div><div className={styles.panel}><PanelTitle title="Incident logic" kicker="EXPLAINABLE & EVENT-LINKED"/><div className={styles.incidentLogic}><span><Move3D size={15}/>Patient trajectory</span><span><Activity size={15}/>Behavior baseline</span><span><Shield size={15}/>Zone context</span><span><Camera size={15}/>Vision state</span></div></div></section>;
}
