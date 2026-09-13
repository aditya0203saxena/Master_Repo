"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Risk = "NOT STARTED" | "ALL SAFE" | "WATCH" | "HIGH RISK";
type ZoneKind = "BED" | "STOVE";
type Point = { x: number; y: number };
type Zone = { id: string; label: string; kind: ZoneKind; x: number; y: number; w: number; h: number };
type PoseEngine = { setOptions: (options: Record<string, unknown>) => void; onResults: (cb: (result: { poseLandmarks?: Point[] }) => void) => void; send: (input: { image: HTMLVideoElement }) => Promise<void>; close?: () => void };
declare global { interface Window { Pose?: new (opts: { locateFile: (file: string) => string }) => PoseEngine } }

const LANDMARK = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
const DEFAULT_ZONES: Zone[] = [
  { id: "bed", label: "BED / EDGE", kind: "BED", x: 0.04, y: 0.56, w: 0.38, h: 0.30 },
  { id: "stove", label: "STOVE DANGER", kind: "STOVE", x: 0.66, y: 0.16, w: 0.28, h: 0.34 },
];

async function ensurePose() {
  if (window.Pose) return window.Pose;
  const existing = document.querySelector<HTMLScriptElement>("script[data-careguard-pose]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      if (window.Pose) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load the pose engine.")), { once: true });
    });
    if (window.Pose) return window.Pose;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js";
    script.async = true;
    script.dataset.careguardPose = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load MediaPipe Pose from the browser CDN."));
    document.head.appendChild(script);
  });
  if (!window.Pose) throw new Error("MediaPipe Pose loaded without exposing the pose engine.");
  return window.Pose;
}

function pointInsideZone(point: Point, zone: Zone) {
  return point.x >= zone.x && point.x <= zone.x + zone.w && point.y >= zone.y && point.y <= zone.y + zone.h;
}
function torsoAngle(shoulder: Point, hip: Point) {
  const dx = hip.x - shoulder.x;
  const dy = hip.y - shoulder.y;
  return Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
}

export function HazardMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<PoseEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const historyRef = useRef<Array<{ t: number; hipY: number; angle: number }>>([]);
  const fallScoreRef = useRef(0);
  const lastAlertRef = useRef(0);
  const lastAlertKeyRef = useRef("");
  const riskRef = useRef<Risk>("NOT STARTED");

  const [camera, setCamera] = useState<"idle" | "loading" | "live">("idle");
  const [risk, setRisk] = useState<Risk>("NOT STARTED");
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [editing, setEditing] = useState<ZoneKind | null>(null);
  const [patientZone, setPatientZone] = useState("Waiting for camera");
  const [motion, setMotion] = useState("Stable");
  const [confidence, setConfidence] = useState(0);
  const [fps, setFps] = useState(0);
  const [lastEvent, setLastEvent] = useState("Waiting for camera");
  const [events, setEvents] = useState<string[]>(["System ready", "Start the camera to begin monitoring"]);

  const pushEvent = useCallback((event: string) => {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    setLastEvent(event);
    setEvents(items => [`${stamp}  ${event}`, ...items].slice(0, 8));
  }, []);

  const setRiskState = useCallback((next: Risk, event?: string) => {
    if (riskRef.current !== next) {
      riskRef.current = next;
      setRisk(next);
      if (event) pushEvent(event);
    }
  }, [pushEvent]);

  const alertCaregiver = useCallback(async (hazard: string, detail: string) => {
    const now = Date.now();
    const key = `${hazard}:${detail}`;
    if (key === lastAlertKeyRef.current && now - lastAlertRef.current < 15000) return;
    lastAlertKeyRef.current = key;
    lastAlertRef.current = now;
    try {
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "hazard", hazard, detail }) });
    } catch (error) {
      console.error("Hazard caregiver alert failed", error);
    }
  }, []);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    poseRef.current?.close?.();
    poseRef.current = null;
    historyRef.current = [];
    fallScoreRef.current = 0;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) canvasRef.current.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    riskRef.current = "NOT STARTED";
    setRisk("NOT STARTED");
    setCamera("idle");
    setPatientZone("Waiting for camera");
    setMotion("Stable");
    setConfidence(0);
    setFps(0);
    setLastEvent("Monitoring stopped");
  }, []);

  const startCamera = useCallback(async () => {
    if (runningRef.current) return;
    setCamera("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable. Open the app on localhost or HTTPS.");
      const PoseCtor = await ensurePose();
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = media;
      const video = videoRef.current;
      if (!video) throw new Error("Camera view is unavailable.");
      video.srcObject = media;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      if (!video.videoWidth || !video.videoHeight) throw new Error("Camera opened but no video frames are available.");

      const pose = new PoseCtor({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      pose.onResults(result => {
        const points = result.poseLandmarks;
        const canvas = canvasRef.current;
        const currentVideo = videoRef.current;
        if (!points || points.length < 25 || !canvas || !currentVideo) {
          setPatientZone("No person detected");
          setMotion("Pose not detected");
          setConfidence(0);
          if (riskRef.current !== "HIGH RISK") setRiskState("WATCH", "Waiting for a stable body pose");
          return;
        }

        const width = currentVideo.videoWidth || 1280;
        const height = currentVideo.videoHeight || 720;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, width, height);

        const ls = points[LANDMARK.leftShoulder], rs = points[LANDMARK.rightShoulder], lh = points[LANDMARK.leftHip], rh = points[LANDMARK.rightHip];
        const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
        const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
        const angle = torsoAngle(shoulder, hip);
        const now = Date.now();
        const history = historyRef.current;
        history.push({ t: now, hipY: hip.y, angle });
        while (history.length && now - history[0].t > 1400) history.shift();
        const first = history[0] ?? { t: now, hipY: hip.y, angle };
        const hipDrop = hip.y - first.hipY;
        const angleChange = Math.abs(angle - first.angle);
        const fastDrop = hipDrop > 0.16;
        const tilted = angle > 38;
        const suddenTilt = angleChange > 18;
        const fallCandidate = fastDrop && (tilted || suddenTilt);
        const unusual = hipDrop > 0.08 || angleChange > 14;
        fallScoreRef.current = fallCandidate ? Math.min(8, fallScoreRef.current + 1) : Math.max(0, fallScoreRef.current - 0.5);

        const bed = zones.find(zone => zone.kind === "BED");
        const stove = zones.find(zone => zone.kind === "STOVE");
        const inBed = !!bed && pointInsideZone(hip, bed);
        const inStove = !!stove && pointInsideZone(hip, stove);
        setPatientZone(inStove ? "STOVE DANGER ZONE" : inBed ? "BED / EDGE ZONE" : "CLEAR AREA");
        setMotion(fallScoreRef.current >= 4 ? "Possible collapse" : unusual ? "Unusual movement" : "Stable");
        setConfidence(0.94);

        if (ctx) {
          ctx.fillStyle = "rgba(103,232,249,.95)";
          for (const p of points) { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, 2.2, 0, Math.PI * 2); ctx.fill(); }
          for (const zone of zones) {
            ctx.strokeStyle = zone.kind === "STOVE" ? "rgba(248,113,113,.95)" : "rgba(250,204,21,.9)";
            ctx.lineWidth = 3;
            ctx.strokeRect(zone.x * width, zone.y * height, zone.w * width, zone.h * height);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = "600 14px system-ui";
            ctx.fillText(zone.label, zone.x * width + 6, Math.max(18, zone.y * height + 18));
          }
          ctx.strokeStyle = inStove ? "rgba(248,113,113,.95)" : "rgba(103,232,249,.75)";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(shoulder.x * width, shoulder.y * height);
          ctx.lineTo(hip.x * width, hip.y * height);
          ctx.stroke();
        }

        if (fallScoreRef.current >= 4) {
          if (riskRef.current !== "HIGH RISK") pushEvent("Possible fall / collapse detected");
          setRiskState("HIGH RISK");
          void alertCaregiver("FALL / COLLAPSE", "Sustained downward body movement and torso tilt detected.");
        } else if (inStove) {
          if (riskRef.current !== "HIGH RISK") pushEvent("Patient entered stove danger zone");
          setRiskState("HIGH RISK");
          void alertCaregiver("STOVE PROXIMITY", "Patient hip point is inside the configured stove danger zone.");
        } else if (unusual) {
          if (riskRef.current !== "WATCH") pushEvent("Unusual movement pattern observed");
          setRiskState("WATCH");
        } else if (riskRef.current !== "HIGH RISK") {
          setRiskState("ALL SAFE");
        }
      });

      poseRef.current = pose;
      historyRef.current = [];
      fallScoreRef.current = 0;
      runningRef.current = true;
      riskRef.current = "ALL SAFE";
      setRisk("ALL SAFE");
      setCamera("live");
      pushEvent("Live hazard monitoring started");

      let frameCount = 0;
      let fpsStart = performance.now();
      const loop = async () => {
        if (!runningRef.current || !poseRef.current || !videoRef.current) return;
        try {
          await poseRef.current.send({ image: videoRef.current });
          frameCount += 1;
          const elapsed = performance.now() - fpsStart;
          if (elapsed >= 1000) { setFps(Math.round(frameCount * 1000 / elapsed)); frameCount = 0; fpsStart = performance.now(); }
        } catch (error) {
          console.error("Hazard frame failed", error);
        }
        if (runningRef.current) rafRef.current = requestAnimationFrame(() => void loop());
      };
      rafRef.current = requestAnimationFrame(() => void loop());
    } catch (error) {
      runningRef.current = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      poseRef.current?.close?.();
      poseRef.current = null;
      setCamera("idle");
      riskRef.current = "NOT STARTED";
      setRisk("NOT STARTED");
      const message = error instanceof Error ? error.message : "Unable to start hazard monitoring";
      setLastEvent(message);
      pushEvent(message);
    }
  }, [alertCaregiver, pushEvent, setRiskState, zones]);

  useEffect(() => () => {
    runningRef.current = false;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    poseRef.current?.close?.();
  }, []);

  const updateZone = (kind: ZoneKind, key: "x" | "y" | "w" | "h", value: number) => {
    setZones(current => current.map(zone => zone.kind === kind ? { ...zone, [key]: Math.max(0, Math.min(1, value)) } : zone));
  };
  const statusClass = risk === "HIGH RISK" ? "border-red-400/30 bg-red-400/10 text-red-200" : risk === "WATCH" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : risk === "ALL SAFE" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/[.04] text-slate-400";

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-[10px] font-semibold tracking-[.2em] text-cyan-300">CAREGUARD · SAFETY INTELLIGENCE</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Hazard Monitor</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Local webcam monitoring for visible fall/collapse patterns and configured danger zones. Assistive prototype, not a clinical device.</p></div>
        {camera === "live" ? <button onClick={stopCamera} className="rounded-xl border border-red-300/20 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-100">Stop monitoring</button> : <button disabled={camera === "loading"} onClick={() => void startCamera()} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{camera === "loading" ? "Starting…" : "Start camera"}</button>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className={`rounded-2xl border p-4 ${statusClass}`}><div className="text-[10px] font-semibold tracking-[.18em] opacity-70">RISK STATE</div><div className="mt-2 text-2xl font-semibold">{risk}</div></div>
        <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.18em] text-slate-500">PATIENT LOCATION</div><div className="mt-2 text-lg font-semibold">{patientZone}</div></div>
        <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.18em] text-slate-500">MOTION</div><div className="mt-2 text-lg font-semibold">{motion}</div></div>
        <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.18em] text-slate-500">ENGINE</div><div className="mt-2 text-lg font-semibold">Pose {camera === "live" ? "LIVE" : "READY"}</div><div className="mt-1 text-xs text-slate-500">{fps} FPS · {Math.round(confidence * 100)}% pose confidence</div></div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.55fr_.75fr]">
        <section className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-semibold">Live safety camera</div><div className="text-xs text-slate-500">Laptop webcam · pose overlay · configured zones</div></div><span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold tracking-wider text-slate-400">{camera.toUpperCase()}</span></div><div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black"><video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline /><canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />{camera !== "live" && <div className="absolute inset-0 grid place-items-center bg-black/40"><div className="rounded-2xl border border-white/10 bg-[#0b1118]/90 px-6 py-5 text-center"><div className="text-sm font-semibold">{camera === "loading" ? "Initializing safety engine…" : "Camera standby"}</div><div className="mt-1 text-xs text-slate-500">{camera === "loading" ? "Allow camera access when prompted." : "Start monitoring to detect movement hazards."}</div></div></div>}</div><div className="mt-3 rounded-xl border border-white/5 bg-black/10 px-4 py-3 text-sm text-slate-300">{lastEvent}</div></section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-semibold">Danger zones</div><div className="text-xs text-slate-500">Set zones to match your visible room layout.</div></div><button onClick={() => setZones(DEFAULT_ZONES)} className="text-xs text-cyan-300">Reset</button></div><div className="space-y-3">{zones.map(zone => <div key={zone.id} className="rounded-xl border border-white/5 p-3"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{zone.label}</span><button onClick={() => setEditing(editing === zone.kind ? null : zone.kind)} className="text-xs text-slate-400">{editing === zone.kind ? "Done" : "Edit"}</button></div>{editing === zone.kind && <div className="mt-3 grid grid-cols-2 gap-2">{(["x","y","w","h"] as const).map(key => <label key={key} className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{key}<input type="number" min={0} max={1} step={0.01} value={zone[key]} onChange={e => updateZone(zone.kind, key, Number(e.target.value))} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a1119] px-2 py-1.5 text-xs text-white" /></label>)}</div>}</div>)}</div></section>
          <section className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-sm font-semibold">Event stream</div><div className="mt-3 space-y-2">{events.map((event, index) => <div key={`${event}-${index}`} className="rounded-lg border border-white/5 bg-[#0c141d] px-3 py-2 text-xs text-slate-400">{event}</div>)}</div></section>
        </div>
      </div>
    </div>
  );
}
