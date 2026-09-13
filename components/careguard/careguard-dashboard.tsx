"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BrainCircuit,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  EyeOff,
  HeartPulse,
  Home,
  Menu,
  MessageCircle,
  Mic2,
  MonitorSmartphone,
  Move3D,
  PhoneCall,
  RotateCcw,
  Settings2,
  Shield,
  Siren,
  Smile,
  Sparkles,
  Stethoscope,
  Utensils,
  X,
} from "lucide-react";
import styles from "./careguard.module.css";

type TabId = "overview" | "patient" | "vision" | "safety" | "communication" | "alerts";
type Command = "YES" | "NO" | "FOOD OR WATER" | "RESTROOM" | "PAIN" | "CALL CAREGIVER";

type Landmark = { x: number; y: number; z?: number };
type FaceResult = { multiFaceLandmarks?: Landmark[][] };

type FaceMeshInstance = {
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: FaceResult) => void): void;
  send(input: { image: HTMLVideoElement }): Promise<void>;
  close?: () => void;
};

type FaceMeshConstructor = new (options: {
  locateFile: (file: string) => string;
}) => FaceMeshInstance;

declare global {
  interface Window {
    FaceMesh?: FaceMeshConstructor;
  }
}

const tabs: Array<{ id: TabId; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "patient", label: "Patient", icon: Smile },
  { id: "vision", label: "Vision", icon: Eye },
  { id: "safety", label: "Safety", icon: Shield },
  { id: "communication", label: "Communication", icon: MessageCircle },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
];

const gestureMap: Array<{ gesture: string; command: Command }> = [
  { gesture: "1× blink", command: "YES" },
  { gesture: "2× blink", command: "NO" },
  { gesture: "Look left", command: "FOOD OR WATER" },
  { gesture: "Look right", command: "RESTROOM" },
  { gesture: "Raise eyebrow", command: "PAIN" },
  { gesture: "Mouth movement", command: "CALL CAREGIVER" },
];

const timelineSeed = [
  { time: "14:32", title: "MOVEMENT DETECTED", detail: "Bedroom → Living Room", confidence: "96%", tone: "good" },
  { time: "14:18", title: "COMMUNICATION REQUEST", detail: "Patient requested water", confidence: "94%", tone: "good" },
  { time: "13:57", title: "ENVIRONMENTAL SCAN", detail: "No hazards detected", confidence: "—", tone: "good" },
];

const zones = [
  { name: "Kitchen", risk: "Moderate risk", tone: "moderate" },
  { name: "Stairs", risk: "High risk", tone: "high" },
  { name: "Bathroom", risk: "Moderate risk", tone: "moderate" },
  { name: "Bedroom", risk: "Low risk", tone: "low" },
  { name: "Living Room", risk: "Low risk", tone: "low" },
];

const patientMetrics = [
  ["Eye gaze", 96],
  ["Left blink", 91],
  ["Right blink", 72],
  ["Eyebrow movement", 84],
  ["Head movement", 93],
  ["Mouth movement", 43],
];

const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const LEFT_EYE = { top: 159, bottom: 145, left: 130, right: 243 };
const RIGHT_EYE = { top: 386, bottom: 374, left: 263, right: 362 };
const LEFT_IRIS = { center: 468, a: 33, b: 133 };
const RIGHT_IRIS = { center: 473, a: 362, b: 263 };
const LEFT_BROW = 105;
const RIGHT_BROW = 334;
const LEFT_LID = 159;
const RIGHT_LID = 386;
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const FACE_TOP = 10;
const FACE_BOTTOM = 152;

function eyeRatio(landmarks: Landmark[], eye: typeof LEFT_EYE) {
  const vertical = distance(landmarks[eye.top], landmarks[eye.bottom]);
  const horizontal = distance(landmarks[eye.left], landmarks[eye.right]);
  return horizontal > 0 ? vertical / horizontal : 0;
}

function faceHeight(landmarks: Landmark[]) {
  return Math.max(0.0001, distance(landmarks[FACE_TOP], landmarks[FACE_BOTTOM]));
}

function normalizedBrowLift(landmarks: Landmark[]) {
  const h = faceHeight(landmarks);
  const left = distance(landmarks[LEFT_BROW], landmarks[LEFT_LID]) / h;
  const right = distance(landmarks[RIGHT_BROW], landmarks[RIGHT_LID]) / h;
  return (left + right) / 2;
}

function normalizedMouthOpening(landmarks: Landmark[]) {
  return distance(landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]) / faceHeight(landmarks);
}

function irisPosition(landmarks: Landmark[], iris: typeof LEFT_IRIS) {
  const center = landmarks[iris.center];
  const a = landmarks[iris.a];
  const b = landmarks[iris.b];
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const width = Math.max(0.0001, maxX - minX);
  return clamp((center.x - minX) / width, 0, 1);
}

function gazePosition(landmarks: Landmark[]) {
  return (irisPosition(landmarks, LEFT_IRIS) + irisPosition(landmarks, RIGHT_IRIS)) / 2;
}

async function loadFaceMeshScript() {
  if (window.FaceMesh) return window.FaceMesh;

  const existing = document.querySelector<HTMLScriptElement>('script[data-careguard-facemesh="true"]');
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load the vision engine.")), { once: true });
    });
    return window.FaceMesh;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
    script.async = true;
    script.dataset.careguardFacemesh = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the browser vision engine."));
    document.head.appendChild(script);
  });

  return window.FaceMesh;
}

export function CareGuardDashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameraState, setCameraState] = useState<"standby" | "loading" | "live">("standby");
  const [faceState, setFaceState] = useState("Not found");
  const [gazeState, setGazeState] = useState("Center");
  const [eyeRatioState, setEyeRatioState] = useState("—");
  const [gestureState, setGestureState] = useState("Waiting for camera");
  const [command, setCommand] = useState<Command | "—">("—");
  const [commandTrigger, setCommandTrigger] = useState("Enable vision and perform a gesture.");
  const [blinkCount, setBlinkCount] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState(1);
  const [timeline, setTimeline] = useState(timelineSeed);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const faceMeshRef = useRef<FaceMeshInstance | null>(null);
  const pendingBlinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBlinkCountRef = useRef(0);
  const lastBlinkAtRef = useRef(0);
  const wasClosedRef = useRef(false);
  const closedFramesRef = useRef(0);
  const openFramesRef = useRef(0);
  const lastCommandAtRef = useRef(0);
  const lastContinuousGestureAtRef = useRef(0);
  const gazeCandidateRef = useRef("CENTER");
  const gazeFramesRef = useRef(0);
  const eyebrowFramesRef = useRef(0);
  const mouthFramesRef = useRef(0);
  const calibrationFramesRef = useRef(0);
  const eyebrowValuesRef = useRef<number[]>([]);
  const mouthValuesRef = useRef<number[]>([]);
  const eyebrowBaselineRef = useRef(0);
  const mouthBaselineRef = useRef(0);

  const resetDetectionState = useCallback((withCamera = Boolean(streamRef.current)) => {
    if (pendingBlinkTimerRef.current) clearTimeout(pendingBlinkTimerRef.current);
    pendingBlinkTimerRef.current = null;
    pendingBlinkCountRef.current = 0;
    lastBlinkAtRef.current = 0;
    wasClosedRef.current = false;
    closedFramesRef.current = 0;
    openFramesRef.current = 0;
    gazeCandidateRef.current = "CENTER";
    gazeFramesRef.current = 0;
    eyebrowFramesRef.current = 0;
    mouthFramesRef.current = 0;
    calibrationFramesRef.current = 0;
    eyebrowValuesRef.current = [];
    mouthValuesRef.current = [];
    eyebrowBaselineRef.current = 0;
    mouthBaselineRef.current = 0;
    setBlinkCount(0);
    setEyeRatioState("—");
    setFaceState("Not found");
    setGazeState("Center");
    setGestureState(withCamera ? "Calibrating…" : "Waiting for camera");
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }, []);

  const recordEvent = useCallback((title: string, detail: string, confidence = "—", tone = "good") => {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    setTimeline((current) => [
      { time, title, detail, confidence, tone },
      ...current,
    ].slice(0, 6));
  }, []);

  const issueCommand = useCallback((nextCommand: Command, trigger: string, announce = true) => {
    const now = performance.now();
    if (now - lastCommandAtRef.current < 700) return;
    lastCommandAtRef.current = now;
    setCommand(nextCommand);
    setCommandTrigger(`Triggered by ${trigger}`);
    setGestureState(`${trigger} · ${nextCommand}`);
    recordEvent("COMMUNICATION REQUEST", `${nextCommand} · ${trigger}`, "91%", "good");
    if (announce) speak(nextCommand);
    setToast(nextCommand === "CALL CAREGIVER" ? "Caregiver request created" : `Command: ${nextCommand}`);
    window.setTimeout(() => setToast(null), 2400);
  }, [recordEvent, speak]);

  const processBlink = useCallback((ratio: number) => {
    const CLOSED_THRESHOLD = 0.18;
    const OPEN_THRESHOLD = 0.22;
    if (ratio < CLOSED_THRESHOLD) {
      closedFramesRef.current += 1;
      openFramesRef.current = 0;
      if (closedFramesRef.current >= 2) {
        wasClosedRef.current = true;
        setGestureState("Eyes closed");
      }
      return;
    }

    if (ratio > OPEN_THRESHOLD) {
      openFramesRef.current += 1;
      closedFramesRef.current = 0;
      if (wasClosedRef.current && openFramesRef.current >= 2) {
        const now = performance.now();
        if (now - lastBlinkAtRef.current > 350) {
          lastBlinkAtRef.current = now;
          setBlinkCount((count) => {
            const next = count + 1;
            return next;
          });
          pendingBlinkCountRef.current += 1;
          if (pendingBlinkTimerRef.current) clearTimeout(pendingBlinkTimerRef.current);
          if (pendingBlinkCountRef.current >= 2) {
            pendingBlinkCountRef.current = 0;
            issueCommand("NO", "Two blinks");
          } else {
            pendingBlinkTimerRef.current = window.setTimeout(() => {
              if (pendingBlinkCountRef.current === 1) issueCommand("YES", "One blink");
              pendingBlinkCountRef.current = 0;
            }, 850);
          }
        }
        wasClosedRef.current = false;
      } else if (calibrationFramesRef.current >= 45) {
        setGestureState("Eyes open");
      }
    }
  }, [issueCommand]);

  const processGaze = useCallback((landmarks: Landmark[]) => {
    if (calibrationFramesRef.current < 45) return;
    const x = gazePosition(landmarks);
    const candidate = x < 0.39 ? "LEFT" : x > 0.61 ? "RIGHT" : "CENTER";
    setGazeState(candidate === "LEFT" ? "Left" : candidate === "RIGHT" ? "Right" : "Center");
    if (candidate === gazeCandidateRef.current) gazeFramesRef.current += 1;
    else {
      gazeCandidateRef.current = candidate;
      gazeFramesRef.current = 0;
    }
    if (gazeFramesRef.current < 7) return;
    if (performance.now() - lastContinuousGestureAtRef.current < 900) return;
    if (candidate === "LEFT") issueCommand("FOOD OR WATER", "Looking left");
    if (candidate === "RIGHT") issueCommand("RESTROOM", "Looking right");
    lastContinuousGestureAtRef.current = performance.now();
    gazeFramesRef.current = 0;
  }, [issueCommand]);

  const processEyebrow = useCallback((landmarks: Landmark[]) => {
    if (calibrationFramesRef.current < 45) return;
    const lift = normalizedBrowLift(landmarks);
    const threshold = eyebrowBaselineRef.current * 1.3 + 0.012;
    eyebrowFramesRef.current = lift > threshold ? eyebrowFramesRef.current + 1 : Math.max(0, eyebrowFramesRef.current - 1);
    if (eyebrowFramesRef.current >= 8 && performance.now() - lastContinuousGestureAtRef.current > 1200) {
      eyebrowFramesRef.current = 0;
      lastContinuousGestureAtRef.current = performance.now();
      issueCommand("PAIN", "Raised eyebrow");
    }
  }, [issueCommand]);

  const processMouth = useCallback((landmarks: Landmark[]) => {
    if (calibrationFramesRef.current < 45) return;
    const opening = normalizedMouthOpening(landmarks);
    const threshold = Math.max(mouthBaselineRef.current + 0.018, 0.055);
    mouthFramesRef.current = opening > threshold ? mouthFramesRef.current + 1 : Math.max(0, mouthFramesRef.current - 1);
    if (mouthFramesRef.current >= 8 && performance.now() - lastContinuousGestureAtRef.current > 1400) {
      mouthFramesRef.current = 0;
      lastContinuousGestureAtRef.current = performance.now();
      issueCommand("CALL CAREGIVER", "Mouth movement");
    }
  }, [issueCommand]);

  const handleVisionResult = useCallback((results: FaceResult) => {
    const face = results.multiFaceLandmarks?.[0];
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!face || !overlay || !video) {
      setFaceState("Not found");
      setEyeRatioState("—");
      setGazeState("—");
      setGestureState("Move your face into view");
      overlay.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height);
      return;
    }

    setFaceState("Detected");
    const ctx = overlay.getContext("2d");
    if (ctx) {
      overlay.width = video.videoWidth || 1280;
      overlay.height = video.videoHeight || 720;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.fillStyle = "rgba(105, 226, 221, 0.9)";
      [159, 145, 130, 243, 386, 374, 263, 362, 468, 473, 105, 334, 13, 14].forEach((id) => {
        const point = face[id];
        if (!point) return;
        ctx.beginPath();
        ctx.arc(point.x * overlay.width, point.y * overlay.height, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const ratio = (eyeRatio(face, LEFT_EYE) + eyeRatio(face, RIGHT_EYE)) / 2;
    const brow = normalizedBrowLift(face);
    const mouth = normalizedMouthOpening(face);
    setEyeRatioState(ratio.toFixed(3));

    if (calibrationFramesRef.current < 45 && ratio > 0.22) {
      eyebrowValuesRef.current.push(brow);
      mouthValuesRef.current.push(mouth);
      calibrationFramesRef.current += 1;
      const progress = Math.round((calibrationFramesRef.current / 45) * 100);
      if (calibrationFramesRef.current === 45) {
        eyebrowBaselineRef.current = eyebrowValuesRef.current.reduce((sum, value) => sum + value, 0) / eyebrowValuesRef.current.length;
        mouthBaselineRef.current = mouthValuesRef.current.reduce((sum, value) => sum + value, 0) / mouthValuesRef.current.length;
        setGestureState("Calibration complete — perform a facial gesture");
      } else {
        setGestureState(`Calibrating facial baseline… ${progress}%`);
      }
    }

    processBlink(ratio);
    processGaze(face);
    processEyebrow(face);
    processMouth(face);
  }, [processBlink, processEyebrow, processGaze, processMouth]);

  const detectLoop = useCallback(async () => {
    if (!streamRef.current || !faceMeshRef.current || !videoRef.current) return;
    try {
      await faceMeshRef.current.send({ image: videoRef.current });
    } catch (error) {
      console.error("CareGuard FaceMesh error", error);
    }
    rafRef.current = requestAnimationFrame(() => void detectLoop());
  }, [detectLoop]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    faceMeshRef.current?.close?.();
    faceMeshRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    overlayRef.current?.getContext("2d")?.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    setCameraState("standby");
    resetDetectionState(false);
  }, [resetDetectionState]);

  const startCamera = useCallback(async () => {
    setCameraState("loading");
    setToast(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS.");
      const FaceMesh = await loadFaceMeshScript();
      if (!FaceMesh) throw new Error("The vision engine did not initialize.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) throw new Error("Camera view is unavailable.");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const mesh = new FaceMesh({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
      mesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
      mesh.onResults(handleVisionResult);
      faceMeshRef.current = mesh;
      resetDetectionState(true);
      setCameraState("live");
      rafRef.current = requestAnimationFrame(() => void detectLoop());
      recordEvent("VISION SESSION", "Camera started · local browser processing", "—", "good");
    } catch (error) {
      stopCamera();
      setToast(error instanceof Error ? error.message : "Unable to start the camera.");
      window.setTimeout(() => setToast(null), 3200);
    }
  }, [detectLoop, handleVisionResult, recordEvent, resetDetectionState, stopCamera]);

  useEffect(() => {
    return () => {
      if (pendingBlinkTimerRef.current) clearTimeout(pendingBlinkTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      faceMeshRef.current?.close?.();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const summary = useMemo(() => ({
    risk: 8,
    safetyScore: 92,
    confidence: 98.4,
    fallProbability: 4,
  }), []);

  const titleMap: Record<TabId, { title: string; subtitle: string }> = {
    overview: { title: "Patient overview", subtitle: "Sunday · September 13, 2026" },
    patient: { title: "Patient intelligence", subtitle: "Personalized motor and behavioral profile" },
    vision: { title: "Vision intelligence", subtitle: "Local facial gesture processing and camera-aware context" },
    safety: { title: "Home safety intelligence", subtitle: "Contextual hazard reasoning across the camera-aware environment" },
    communication: { title: "Communication", subtitle: "Patient interface · adapts to fatigue and motor capability" },
    alerts: { title: "Alerts & incidents", subtitle: "Explainable, event-linked incident management" },
  };

  const title = titleMap[tab];

  return (
    <div className={styles.app}>
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <div className={styles.brandMark}><Sparkles size={17} /></div>
          <span>CareGuard AI</span>
          <span className={styles.onlineDot} />
          <span className={styles.systemText}>Systems operational</span>
        </div>
        <nav className={styles.nav} aria-label="CareGuard sections">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${tab === item.id ? styles.navActive : ""}`}
                onClick={() => { setTab(item.id); setSidebarOpen(false); }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
                {item.id === "alerts" && activeAlerts > 0 && <span className={styles.navBadge}>{activeAlerts.toString().padStart(2, "0")}</span>}
              </button>
            );
          })}
        </nav>
        <div className={styles.sidebarBottom}>
          <button type="button" className={styles.utilityItem}><Shield size={16} /><span>Privacy center</span></button>
          <button type="button" className={styles.utilityItem}><Settings2 size={16} /><span>Settings</span></button>
        </div>
      </aside>

      <div className={styles.mobileMenuBar}>
        <button type="button" className={styles.iconButton} onClick={() => setSidebarOpen((open) => !open)} aria-label="Open navigation">
          <Menu size={20} />
        </button>
        <span>CareGuard AI</span>
        <span className={styles.mobileStatus}><span className={styles.onlineDot} /> Live</span>
      </div>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <div className={styles.brandDesktop}>
              <div className={styles.brandMark}><Sparkles size={17} /></div>
              <strong>CareGuard AI</strong>
              <span className={styles.onlineDot} />
              <span>Systems operational</span>
            </div>
          </div>
          <div className={styles.topMeta}>
            <div><small>CAMERA</small><span className={styles.stateText}><span className={`${styles.stateDot} ${cameraState === "live" ? styles.stateLive : styles.stateStandby}`} />{cameraState === "live" ? "Live" : cameraState === "loading" ? "Loading" : "Standby"}</span></div>
            <div><small>PROCESSING</small><span>Local</span></div>
            <div><small>CARE ENVIRONMENT</small><span className={styles.stateText}><span className={`${styles.stateDot} ${styles.stateLive}`} />Active</span></div>
            <button type="button" className={styles.demoPill}>◆ Demo mode</button>
          </div>
        </header>

        <div className={styles.page}>
          <div className={styles.pageHeading}>
            <div>
              <h1>{title.title}</h1>
              <p>{title.subtitle} <span className={styles.inlineStatus}>● AI systems operational</span></p>
            </div>
            <div className={styles.patientSummary}>
              <strong>Alex Richardson</strong>
              <span>Severe motor impairment · home monitoring active</span>
              <em>SAFE</em>
            </div>
          </div>

          {tab === "overview" && (
            <OverviewView summary={summary} timeline={timeline} onSelectTab={setTab} />
          )}
          {tab === "patient" && <PatientView onCalibrate={() => setToast("Calibration session prepared")} />}
          {tab === "vision" && (
            <VisionView
              cameraState={cameraState}
              videoRef={videoRef}
              overlayRef={overlayRef}
              faceState={faceState}
              gazeState={gazeState}
              eyeRatio={eyeRatioState}
              gestureState={gestureState}
              command={command}
              commandTrigger={commandTrigger}
              blinkCount={blinkCount}
              onStartCamera={startCamera}
              onStopCamera={stopCamera}
              onReset={() => resetDetectionState(Boolean(streamRef.current))}
              onCommand={issueCommand}
            />
          )}
          {tab === "safety" && <SafetyView zones={zones} onEmergency={() => issueCommand("CALL CAREGIVER", "Emergency protocol")} />}
          {tab === "communication" && <CommunicationView onCommand={(next) => issueCommand(next, "Patient interface")} onEmergency={() => issueCommand("CALL CAREGIVER", "Emergency protocol")} />}
          {tab === "alerts" && (
            <AlertsView
              timeline={timeline}
              activeAlerts={activeAlerts}
              onAcknowledge={(index) => {
                setActiveAlerts((count) => Math.max(0, count - 1));
                recordEvent("ALERT ACKNOWLEDGED", timeline[index]?.title ?? "Incident reviewed", "—", "good");
              }}
            />
          )}

          <footer className={styles.footer}>
            CareGuard AI — Assistive technology prototype. Vision intelligence processed locally where supported. Prototype — not a medical diagnostic system.
          </footer>
        </div>
      </main>

      {toast && <div className={styles.toast} role="status"><Check size={16} />{toast}</div>}
      {sidebarOpen && <button className={styles.sidebarBackdrop} type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

function OverviewView({ summary, timeline, onSelectTab }: { summary: { risk: number; safetyScore: number; confidence: number; fallProbability: number }; timeline: typeof timelineSeed; onSelectTab: (tab: TabId) => void }) {
  return (
    <>
      <section className={styles.metricGrid}>
        <Metric label="SAFETY SCORE" value={`${summary.safetyScore}`} suffix="/100" hint="Low risk" />
        <Metric label="CURRENT ACTIVITY" value="Resting" hint="Bedroom · 14 min" />
        <Metric label="VISION CONFIDENCE" value={`${summary.confidence}`} suffix="%" hint="Live analysis" />
        <Metric label="ACTIVE ALERTS" value="01" hint="Low priority" />
      </section>

      <section className={`${styles.splitGrid} ${styles.overviewSplit}`}>
        <div className={styles.panel}>
          <PanelTitle title="Camera-aware home environment" kicker="DIGITAL TWIN" />
          <HomeMap />
          <div className={styles.legend}><span><i className={styles.safeSwatch} />Safe zone</span><span><i className={styles.restrictedSwatch} />Restricted zone</span><span><i className={styles.hazardSwatch} />Hazard zone</span></div>
          <p className={styles.note}>The laptop webcam establishes a camera-aware safety environment for the room it observes — not full-home coverage.</p>
        </div>

        <div className={styles.panel}>
          <PanelTitle title="AI risk engine" />
          <div className={styles.riskEngine}>
            <div className={styles.riskRing}><strong>{summary.risk}</strong><span>/100</span><em>LOW RISK</em></div>
            <div className={styles.riskRows}>
              <Row label="Posture" value="Normal" />
              <Row label="Movement" value="Stable" />
              <Row label="Environment" value="Clear" />
              <Row label="Restricted zone" value="Clear" />
              <Row label="Fall probability" value={`${summary.fallProbability}%`} />
              <Row label="Inactivity" value="Low" />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.splitGrid}>
        <div className={styles.panel}>
          <PanelTitle title="Risk timeline" right={<div className={styles.segmented}><button className={styles.segmentActive}>6H</button><button>12H</button><button>24H</button></div>} />
          <RiskChart />
        </div>
        <div className={styles.panel}>
          <PanelTitle title="Live intelligence timeline" />
          <Timeline events={timeline} />
        </div>
      </section>

      <section className={styles.quickLinks}>
        <button type="button" onClick={() => onSelectTab("vision")}><Camera size={18} /><span>Open live vision</span><ChevronRight size={16} /></button>
        <button type="button" onClick={() => onSelectTab("safety")}><Shield size={18} /><span>Review home safety</span><ChevronRight size={16} /></button>
        <button type="button" onClick={() => onSelectTab("communication")}><MessageCircle size={18} /><span>Open communication</span><ChevronRight size={16} /></button>
      </section>
    </>
  );
}

function PatientView({ onCalibrate }: { onCalibrate: () => void }) {
  return (
    <>
      <section className={styles.splitGrid}>
        <div className={styles.panel}>
          <PanelTitle title="Patient motor profile" />
          <div className={styles.profileBars}>
            {patientMetrics.map(([label, value]) => <div key={label}><div className={styles.barLabel}><span>{label}</span><strong>{value}%</strong></div><div className={styles.barTrack}><span style={{ width: `${value}%` }} /></div></div>)}
          </div>
          <button type="button" className={styles.secondaryButton} onClick={onCalibrate}><RotateCcw size={15} /> Run personalized calibration</button>
        </div>
        <div className={styles.panel}>
          <PanelTitle title="Personal baseline" kicker="DEVIATION, NOT DIAGNOSIS" />
          <div className={styles.baselineRows}>
            <Row label="Facial symmetry" value="-3%" tone="warning" />
            <Row label="Gaze stability" value="-2%" tone="warning" />
            <Row label="Movement amplitude" value="-8%" tone="warning" />
            <Row label="Response time" value="+11%" tone="good" />
            <Row label="Activity pattern" value="-4%" tone="warning" />
          </div>
          <p className={styles.explanation}>Movement amplitude is 8% below personal baseline. This reflects a deviation from Alex&apos;s own historical pattern — it is not a medical diagnosis.</p>
        </div>
      </section>
      <section className={styles.splitGrid}>
        <div className={styles.panel}>
          <PanelTitle title="Communication fatigue monitor" />
          <div className={styles.baselineRows}>
            <Row label="Blink consistency" value="Stable" />
            <Row label="Gaze stability" value="Slight drift" />
            <Row label="Movement amplitude" value="Reduced" />
            <Row label="Response time" value="+340ms" />
          </div>
          <MiniLineChart />
          <span className={styles.warningPill}>MODERATE FATIGUE</span>
        </div>
        <div className={styles.panel}>
          <PanelTitle title="Typical day" kicker="BEHAVIORAL BASELINE" />
          <div className={styles.scheduleRows}>
            {[["07:30", "Wake"], ["08:15", "Breakfast"], ["10:30", "Rest"], ["12:45", "Living room"], ["14:00", "Rest"], ["22:30", "Sleep"]].map(([time, label]) => <div key={time}><span>{time}</span><strong>{label}</strong></div>)}
          </div>
          <p className={styles.explanation}>Today&apos;s inactivity is currently within expected range for this time of day.</p>
        </div>
      </section>
      <p className={styles.disclaimer}>Baseline comparisons are assistive indicators of change from Alex&apos;s own patterns — never a medical diagnosis.</p>
    </>
  );
}

function VisionView(props: {
  cameraState: "standby" | "loading" | "live";
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayRef: React.RefObject<HTMLCanvasElement | null>;
  faceState: string;
  gazeState: string;
  eyeRatio: string;
  gestureState: string;
  command: Command | "—";
  commandTrigger: string;
  blinkCount: number;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onReset: () => void;
  onCommand: (command: Command, trigger: string) => void;
}) {
  return (
    <>
      <section className={styles.splitGrid}>
        <div className={`${styles.panel} ${styles.cameraPanel}`}>
          <PanelTitle title="Local vision session" kicker="BROWSER PROCESSING" right={<span className={styles.privacyTag}><Shield size={14} />Frames stay in the browser</span>} />
          <div className={styles.videoFrame}>
            <video ref={props.videoRef} autoPlay playsInline muted />
            <canvas ref={props.overlayRef} aria-hidden="true" />
            {props.cameraState !== "live" && <div className={styles.cameraPlaceholder}><Camera size={28} /><strong>{props.cameraState === "loading" ? "Starting vision engine…" : "Camera access required"}</strong><span>Use the camera to enable facial gesture commands.</span></div>}
            {props.cameraState === "live" && <div className={styles.liveBadge}><span className={styles.stateDot} /> Vision live</div>}
          </div>
          <div className={styles.cameraActions}>
            {props.cameraState !== "live" ? <button type="button" className={styles.primaryButton} onClick={props.onStartCamera}><Camera size={16} /> Enable camera</button> : <button type="button" className={styles.secondaryButton} onClick={props.onStopCamera}><EyeOff size={16} /> Stop camera</button>}
            <button type="button" className={styles.secondaryButton} onClick={props.onReset}><RotateCcw size={16} /> Reset calibration</button>
          </div>
        </div>
        <div className={styles.panel}>
          <PanelTitle title="Facial controls" />
          <div className={styles.commandCard}><span>Last command</span><strong>{props.command}</strong><small>{props.commandTrigger}</small></div>
          <div className={styles.metricRowTwo}><div className={styles.smallMetric}><span>Blinks detected</span><strong>{props.blinkCount}</strong></div><div className={styles.smallMetric}><span>Eye openness</span><strong>{props.eyeRatio}</strong></div></div>
          <div className={styles.metricRowTwo}><div className={styles.smallMetric}><span>Gaze</span><strong>{props.gazeState}</strong></div><div className={styles.smallMetric}><span>Face</span><strong>{props.faceState}</strong></div></div>
          <div className={styles.gestureState}>{props.gestureState}</div>
          <div className={styles.gestureMap}>{gestureMap.map((item) => <div key={item.gesture} className={styles.gestureItem}><span>{item.gesture}</span><strong>{item.command}</strong></div>)}</div>
        </div>
      </section>
      <section className={styles.panel}>
        <PanelTitle title="Intent confirmation" kicker="ACCESSIBLE INPUT" />
        <p className={styles.note}>The gesture engine follows the source prototype&apos;s temporal filtering and per-session calibration. Commands are announced locally with speech synthesis and written to the CareGuard incident timeline.</p>
        <div className={styles.commandButtons}>
          {gestureMap.map((item) => <button key={item.command} type="button" onClick={() => props.onCommand(item.command, "Manual test")}>{item.command}</button>)}
        </div>
      </section>
    </>
  );
}

function SafetyView({ zones: zoneData, onEmergency }: { zones: typeof zones; onEmergency: () => void }) {
  return (
    <>
      <section className={styles.splitGrid}>
        <div className={styles.panel}>
          <PanelTitle title="Camera environment & zones" />
          <HomeMap />
          <div className={styles.zoneList}>{zoneData.map((zone) => <div key={zone.name} className={styles.zoneItem}><span><i className={`${styles.zoneDot} ${styles[`zone${zone.tone[0].toUpperCase() + zone.tone.slice(1)}`]}`} />{zone.name}</span><small>{zone.risk}</small><div><button type="button">Edit</button><button type="button">Delete</button></div></div>)}</div>
          <button type="button" className={styles.secondaryButton}><ChevronRight size={15} /> Create zone</button>
        </div>
        <div className={styles.sideStack}>
          <div className={styles.panel}><PanelTitle title="Risk overview" /><Row label="Overall risk" value="8/100" tone="good" /><Row label="Fall probability" value="4%" /><Row label="Inactivity" value="Low" /></div>
          <div className={styles.panel}><PanelTitle title="Why is this a risk?" kicker="EXPLAINABLE AI" /><div className={styles.checkList}><p><Check size={15} />Patient detected</p><p><Check size={15} />No restricted-zone proximity</p><p><Check size={15} />No hazard objects active near patient</p><p><Check size={15} />Risk within personal baseline</p></div></div>
        </div>
      </section>
      <section className={styles.splitGrid}>
        <div className={styles.panel}><PanelTitle title="Pathway safety" /><Pathway /></div>
        <div className={styles.panel}><PanelTitle title="Bathroom monitoring" kicker="PRIVACY-PRESERVING" /><div className={styles.privacyBox}><Shield size={32} /><span>PRIVACY SHIELD ACTIVE</span></div><Row label="Entry" value="10:42" /><Row label="Current duration" value="37 min" /><Row label="Expected" value="5–20 min" /><Row label="Movement" value="None detected" /><span className={styles.warningPill}>CHECK REQUIRED</span></div>
      </section>
      <section className={styles.emergencyStrip}><div><strong>Emergency protocol</strong><span>Manual escalation with incident logging and audible confirmation.</span></div><button type="button" className={styles.emergencyButton} onClick={onEmergency}><Siren size={17} /> Emergency</button></section>
    </>
  );
}

function CommunicationView({ onCommand, onEmergency }: { onCommand: (command: Command) => void; onEmergency: () => void }) {
  const cards: Array<{ label: string; command: Command; icon: typeof Activity }> = [
    { label: "Water", command: "FOOD OR WATER", icon: Activity },
    { label: "Food", command: "FOOD OR WATER", icon: Utensils },
    { label: "Toilet", command: "RESTROOM", icon: MonitorSmartphone },
    { label: "Pain", command: "PAIN", icon: HeartPulse },
    { label: "Help", command: "CALL CAREGIVER", icon: CircleHelp },
    { label: "Family", command: "CALL CAREGIVER", icon: PhoneCall },
  ];
  return (
    <>
      <section className={styles.communicationHero}>
        <div className={styles.communicationHeading}>
          <h2>How can I help?</h2>
          <div><span><i className={styles.stateDot} /> Eye gaze active</span><span><i className={styles.stateDot} /> Facial gesture active</span><strong>Intent confidence <b>91%</b></strong></div>
        </div>
        <div className={styles.communicationGrid}>{cards.map(({ label, command: nextCommand, icon: Icon }) => <button key={label} type="button" onClick={() => onCommand(nextCommand)}><Icon size={26} /><strong>{label}</strong></button>)}</div>
        <div className={styles.commFooter}><button type="button" className={styles.emergencyButton} onClick={onEmergency}>Emergency</button><button type="button" className={styles.secondaryButton} onClick={() => onCommand("CALL CAREGIVER")}>Call caregiver</button></div>
      </section>
      <section className={styles.splitGrid}>
        <div className={styles.panel}><PanelTitle title="Adaptive input" /><Row label="Primary input" value="Eye gaze" /><Row label="Secondary input" value="Left-eye blink" /><Row label="Fatigue" value="Moderate" /><p className={styles.note}>Controls simplify automatically as fatigue rises — from an eye-gaze keyboard, to large category buttons, to a 3-option Yes / No / Help interface.</p><button type="button" className={styles.secondaryButton} onClick={() => onCommand("YES")}>Simulate rising fatigue</button></div>
        <div className={styles.panel}><PanelTitle title="Intentional vs involuntary movement" /><Row label="Blink detected" value="51%" /><p className={styles.explanation}>System waiting for confirmation…</p><button type="button" className={styles.secondaryButton} onClick={() => onCommand("YES")}>Repeat intentional blink</button></div>
      </section>
    </>
  );
}

function AlertsView({ timeline, activeAlerts, onAcknowledge }: { timeline: typeof timelineSeed; activeAlerts: number; onAcknowledge: (index: number) => void }) {
  const active = timeline.slice(0, Math.max(2, activeAlerts));
  return (
    <>
      <section className={styles.alertsStack}>
        <p className={styles.sectionLabel}>WARNING</p>
        {active.map((event, index) => <div key={`${event.time}-${index}`} className={styles.alertCard}><div className={styles.alertIcon}><AlertTriangle size={18} /></div><div className={styles.alertContent}><strong>{event.title === "COMMUNICATION REQUEST" ? "Communication request" : event.title === "VISION SESSION" ? "Vision session started" : "Hazard detected"}</strong><span>{event.time} · {event.detail}</span><div><button type="button">View event</button><button type="button">View camera</button><button type="button" onClick={() => onAcknowledge(index)}>Acknowledge</button></div></div></div>)}
        <p className={styles.sectionLabel}>RESOLVED</p>
        <div className={`${styles.alertCard} ${styles.resolved}`}><div className={styles.resolvedIcon}><Check size={17} /></div><div className={styles.alertContent}><strong>Environmental scan complete</strong><span>13:57 · No hazards detected</span></div></div>
      </section>
      <section className={styles.panel}><PanelTitle title="Incident logic" kicker="EXPLAINABLE & EVENT-LINKED" /><div className={styles.incidentLogic}><span><BrainCircuit size={17} />Object detection</span><span><Move3D size={17} />Patient trajectory</span><span><Activity size={17} />Behavior baseline</span><span><Shield size={17} />Zone context</span></div><p className={styles.note}>Hazard reasoning combines object detection, patient location, trajectory and state — never a single trigger in isolation.</p></section>
    </>
  );
}

function Metric({ label, value, suffix, hint }: { label: string; value: string; suffix?: string; hint: string }) {
  return <div className={styles.metricCard}><span>{label}</span><strong>{value}<small>{suffix}</small></strong><em>{hint}</em></div>;
}

function PanelTitle({ title, kicker, right }: { title: string; kicker?: string; right?: React.ReactNode }) {
  return <div className={styles.panelTitle}><div><h2>{title}</h2>{kicker && <span>{kicker}</span>}</div>{right}</div>;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "warning" }) {
  return <div className={styles.row}><span>{label}</span><strong className={tone === "good" ? styles.good : tone === "warning" ? styles.warning : undefined}>{value}</strong></div>;
}

function HomeMap() {
  return <div className={styles.homeMap}>
    <div className={`${styles.room} ${styles.roomBedroom}`}><span>BEDROOM</span><i /></div>
    <div className={`${styles.room} ${styles.roomKitchen}`}><span>KITCHEN</span></div>
    <div className={`${styles.room} ${styles.roomLiving}`}><span>LIVING ROOM</span></div>
    <div className={`${styles.room} ${styles.roomStairs}`}><span>STAIRS</span></div>
    <div className={`${styles.room} ${styles.roomBath}`}><span>BATHROOM</span></div>
    <div className={styles.mapPatient}><span /></div>
  </div>;
}

function RiskChart() {
  const points = "8,118 70,120 132,117 194,119 256,116 318,119 380,117 442,118 504,116 566,118 628,117 690,119 752,117 814,118";
  return <div className={styles.chartWrap}><svg viewBox="0 0 820 150" role="img" aria-label="Risk trend"><line x1="10" y1="100" x2="810" y2="100" stroke="rgba(242,173,90,.25)" strokeDasharray="6 6" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" className={styles.chartLine} /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="10" strokeOpacity=".07" className={styles.chartLineGlow} /></svg></div>;
}

function MiniLineChart() {
  return <div className={styles.miniChart}><svg viewBox="0 0 500 100" preserveAspectRatio="none" aria-label="Fatigue trend"><polyline points="0,72 80,70 160,65 240,59 320,56 400,42 500,37" fill="none" stroke="currentColor" strokeWidth="3" className={styles.fatigueLine} /></svg></div>;
}

function Pathway() {
  return <div className={styles.pathway}><div className={styles.pathTrack}><span className={styles.pathProgress} /><span className={styles.obstacle}>!</span><div className={styles.pathLabel}>OBSTACLE · 1.3m</div><div className={styles.detour}>ALTERNATIVE ROUTE · AVAILABLE</div><svg viewBox="0 0 460 120"><path d="M330 100 C350 42, 410 35, 440 95" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="8 8" className={styles.detourLine} /></svg></div></div>;
}

function Timeline({ events }: { events: typeof timelineSeed }) {
  return <div className={styles.timeline}>{events.slice(0, 4).map((event, index) => <div key={`${event.time}-${index}`} className={styles.timelineEvent}><span className={styles.timelineTime}>{event.time}</span><span className={`${styles.timelineDot} ${event.tone === "good" ? styles.timelineGood : ""}`} /><div><strong>{event.title}</strong><span>{event.detail}</span><small>Confidence {event.confidence}</small></div></div>)}</div>;
}
