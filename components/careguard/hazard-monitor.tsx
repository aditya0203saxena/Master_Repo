"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Risk = "NOT STARTED" | "ALL SAFE" | "WATCH" | "HIGH RISK";
type ZoneKind = "BED" | "STOVE";
type Point = { x: number; y: number };

type PoseResult = {
  poseLandmarks?: Point[];
};

type PoseEngine = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (cb: (result: PoseResult) => void) => void;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

declare global {
  interface Window {
    Pose?: new (opts: { locateFile: (file: string) => string }) => PoseEngine;
  }
}

const POSE_LANDMARK = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
};

const DEFAULT_ZONES = [
  { id: "bed", label: "BED / EDGE", kind: "BED" as ZoneKind, x: 0.05, y: 0.56, w: 0.37, h: 0.3 },
  { id: "stove", label: "STOVE DANGER", kind: "STOVE" as ZoneKind, x: 0.68, y: 0.18, w: 0.25, h: 0.34 },
];

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function ensurePose() {
  if (window.Pose) return window.Pose;
  const existing = document.querySelector<HTMLScriptElement>("script[data-careguard-pose]");
  if (existing) {
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Pose engine failed to load.")), { once: true });
    });
    return window.Pose;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js";
    script.async = true;
    script.dataset.careguardPose = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load the browser pose engine."));
    document.head.appendChild(script);
  });
  return window.Pose;
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function HazardMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<PoseEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<Array<{ t: number; hipY: number; torso: number }>>([]);
  const riskRef = useRef<Risk>("NOT STARTED");
  const lastAlertRef = useRef(0);

  const [camera, setCamera] = useState<"idle" | "loading" | "live">("idle");
  const [risk, setRisk] = useState<Risk>("NOT STARTED");
  const [zoneMode, setZoneMode] = useState<ZoneKind | null>(null);
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [lastEvent, setLastEvent] = useState("Waiting for camera");
  const [events, setEvents] = useState<string[]>(["System ready", "No hazard signal yet"]);
  const [motion, setMotion] = useState("Stable");
  const [patientZone, setPatientZone] = useState("Unresolved");

  const pushEvent = useCallback((event: string) => {
    setLastEvent(event);
    setEvents((items) => [`${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}  ${event}`, ...items].slice(0, 7));
  }, []);

  const setRiskState = useCallback((next: Risk, event?: string) => {
    if (riskRef.current !== next) {
      riskRef.current = next;
      setRisk(next);
      if (event) pushEvent(event);
    } else if (event && next !== "ALL SAFE") {
      pushEvent(event);
    }
  }, [pushEvent]);

  const alertCaregiver = useCallback(async (hazard: string, detail: string) => {
    if (Date.now() - lastAlertRef.current < 15000) return;
    lastAlertRef.current = Date.now();
    try {
      await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "hazard", hazard, detail }),
      });
    } catch (error) {
      console.error("Hazard Telegram alert failed", error);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    poseRef.current?.close?.();
    poseRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
    riskRef.current = "NOT STARTED";
    setRisk("NOT STARTED");
    setMotion("Stable");
    setPatientZone("Unresolved");
    setLastEvent("Monitoring stopped");
  }, []);

  const startCamera = useCallback(async () => {
    if (camera === "live") return;
    setCamera("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS.");
      const PoseCtor = await ensurePose();
      if (!PoseCtor) throw new Error("Pose engine unavailable.");
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
      streamRef.current = media;
      if (!videoRef.current) throw new Error("Camera view unavailable.");
      videoRef.current.srcObject = media;
      await videoRef.current.play();

      const engine = new PoseCtor({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
      engine.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      engine.onResults((result) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const landmarks = result.poseLandmarks;
        if (!canvas || !video) return;
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);

        if (!landmarks || landmarks.length < 27) {
          setPatientZone("No pose");
          setMotion("No pose");
          setRiskState("WATCH", "Pose temporarily lost");
          return;
        }

        const ls = landmarks[POSE_LANDMARK.leftShoulder];
        const rs = landmarks[POSE_LANDMARK.rightShoulder];
        const lh = landmarks[POSE_LANDMARK.leftHip];
        const rh = landmarks[POSE_LANDMARK.rightHip];
        const lk = landmarks[POSE_LANDMARK.leftKnee];
        const rk = landmarks[POSE_LANDMARK.rightKnee];
        const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
        const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
        const knee = { x: (lk.x + rk.x) / 2, y: (lk.y + rk.y) / 2 };
        const torsoAngle = Math.abs(Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * 180 / Math.PI) - 90;
        const torso = Math.abs(torsoAngle);
        const now = Date.now();
        const history = historyRef.current;
        history.push({ t: now, hipY: hip.y, torso });
        while (history.length && now - history[0].t > 1800) history.shift();
        const first = history[0];
        const hipDrop = first ? hip.y - first.hipY : 0;
        const torsoSwing = first ? Math.abs(torso - first.torso) : 0;
        const fallSignal = hipDrop > 0.22 && torso > 50 && torsoSwing > 20;
        const nearFallSignal = hipDrop > 0.12 || torsoSwing > 28;

        const inZone = (zone: typeof DEFAULT_ZONES[number]) => hip.x >= zone.x && hip.x <= zone.x + zone.w && hip.y >= zone.y && hip.y <= zone.y + zone.h;
        const stove = zones.find((zone) => zone.kind === "STOVE");
        const bed = zones.find((zone) => zone.kind === "BED");
        const inStove = stove ? inZone(stove) : false;
        const inBed = bed ? inZone(bed) : false;

        setPatientZone(inStove ? "Stove danger zone" : inBed ? "Bed / edge zone" : "Clear area");
        setMotion(fallSignal ? "Collapse pattern" : nearFallSignal ? "Unusual movement" : "Stable");

        if (ctx) {
          ctx.strokeStyle = "rgba(103,232,249,.9)";
          ctx.lineWidth = 2;
          landmarks.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x * canvas.width, p.y * canvas.height, 2.2, 0, Math.PI * 2);
            ctx.stroke();
          });
        }

        if (fallSignal) {
          setRiskState("HIGH RISK", "Possible fall / collapse detected");
          void alertCaregiver("FALL / COLLAPSE", "Camera-aware pose analysis detected a sustained collapse pattern.");
        } else if (inStove) {
          setRiskState("HIGH RISK", "Patient entered stove danger zone");
          void alertCaregiver("STOVE PROXIMITY", "Patient is inside the configured stove danger zone.");
        } else if (nearFallSignal) {
          setRiskState("WATCH", "Unusual movement pattern observed");
        } else {
          setRiskState("ALL SAFE");
        }

        zones.forEach((zone) => {
          if (!ctx) return;
          ctx.strokeStyle = zone.kind === "STOVE" ? "rgba(248,113,113,.85)" : "rgba(250,204,21,.75)";
          ctx.lineWidth = 3;
          ctx.strokeRect(zone.x * canvas.width, zone.y * canvas.height, zone.w * canvas.width, zone.h * canvas.height);
        });
      });
      poseRef.current = engine;
      historyRef.current = [];
      setRiskState("ALL SAFE", "Monitoring active — no hazard detected");
      setCamera("live");

      const loop = async () => {
        if (!streamRef.current || !poseRef.current || !videoRef.current) return;
        try {
          await poseRef.current.send({ image: videoRef.current });
        } catch (error) {
          console.error("Pose frame failed", error);
        }
        rafRef.current = window.requestAnimationFrame(() => void loop());
      };
      rafRef.current = window.requestAnimationFrame(() => void loop());
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCamera("idle");
      setRiskState("NOT STARTED");
      setLastEvent(error instanceof Error ? error.message : "Unable to start camera");
    }
  }, [alertCaregiver, camera, setRiskState, zones]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const riskTone = useMemo(() => {
    if (risk === "HIGH RISK") return "border-red-400/40 bg-red-400/10 text-red-300";
    if (risk === "WATCH") return "border-amber-300/40 bg-amber-300/10 text-amber-200";
    if (risk === "ALL SAFE") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
    return "border-white/10 bg-white/[0.03] text-slate-300";
  }, [risk]);

  const updateZone = (kind: ZoneKind, key: "x" | "y" | "w" | "h", value: number) => {
    setZones((items) => items.map((zone) => zone.kind === kind ? { ...zone, [key]: Math.max(0, Math.min(1, value)) } : zone));
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0c1219] p-5 shadow-[0_24px_80px_rgba(0,0,0,.32)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold tracking-[.22em] text-cyan-300">CAREGUARD AI · HOME SAFETY</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Hazard Monitor</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Local webcam-based safety intelligence for fall/collapse patterns, stove proximity, and configurable bed / edge zones. Processing stays in the browser.</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-right ${riskTone}`}>
          <div className="text-[9px] font-semibold tracking-[.2em] opacity-70">RISK STATE</div>
          <div className="mt-1 text-lg font-semibold">{risk}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="relative aspect-video">
            <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {camera !== "live" && <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,.08),transparent_45%)]"><div className="text-center"><div className="text-xs font-semibold tracking-[.18em] text-slate-500">CAMERA STANDBY</div><div className="mt-2 text-sm text-slate-300">Start Hazard Monitor to begin local pose tracking.</div></div></div>}
            <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-semibold tracking-[.16em] text-slate-300 backdrop-blur">LAPTOP WEBCAM · LOCAL PROCESSING</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-4">
            <button onClick={camera === "live" ? stopCamera : startCamera} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60" disabled={camera === "loading"}>{camera === "live" ? "Stop monitor" : camera === "loading" ? "Starting…" : "Start monitor"}</button>
            <span className="text-xs text-slate-500">Patient location: <span className="text-slate-200">{patientZone}</span></span>
            <span className="text-xs text-slate-500">Motion: <span className="text-slate-200">{motion}</span></span>
          </div>
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[9px] tracking-[.15em] text-slate-500">CAMERA</div><div className="mt-2 text-lg font-semibold">{camera === "live" ? "LIVE" : "OFF"}</div></div>
            <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[9px] tracking-[.15em] text-slate-500">LAST EVENT</div><div className="mt-2 text-sm font-semibold text-slate-200">{lastEvent}</div></div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111923] p-4">
            <div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">ZONE CONFIGURATION</div>
            <div className="mt-4 space-y-4">
              {zones.map((zone) => (
                <div key={zone.id} className="rounded-xl border border-white/5 bg-black/20 p-3">
                  <div className="flex items-center justify-between"><span className="text-sm font-medium">{zone.label}</span><button onClick={() => setZoneMode(zoneMode === zone.kind ? null : zone.kind)} className="text-[10px] font-semibold tracking-[.12em] text-cyan-300">{zoneMode === zone.kind ? "EDITING" : "CONFIGURE"}</button></div>
                  {zoneMode === zone.kind && <div className="mt-3 grid grid-cols-2 gap-2">
                    {(["x", "y", "w", "h"] as const).map((key) => <label key={key} className="text-[10px] text-slate-500"><span className="mb-1 block uppercase">{key}</span><input type="range" min="0" max="1" step="0.01" value={zone[key]} onChange={(event) => updateZone(zone.kind, key, Number(event.target.value))} className="w-full" /></label>)}
                  </div>}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#111923] p-4">
            <div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">LIVE EVENT STREAM</div>
            <div className="mt-3 space-y-2">{events.map((event, index) => <div key={`${event}-${index}`} className="border-b border-white/5 pb-2 text-xs text-slate-400 last:border-0 last:pb-0">{event}</div>)}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {["Fall / collapse pattern", "Stove proximity", "Bed / edge proximity"].map((label, index) => <div key={label} className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">{label}</div><div className="mt-2 text-sm text-slate-300">{index === 0 ? "Multi-signal pose + temporal smoothing" : index === 1 ? "Configured camera danger zone" : "Configurable bed / edge zone"}</div></div>)}
      </div>
    </section>
  );
}
