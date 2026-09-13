"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Risk = "NOT STARTED" | "ALL SAFE" | "WATCH" | "HIGH RISK";
type ZoneKind = "BED" | "STOVE";
type Point = { x: number; y: number };
type Zone = { id: string; label: string; kind: ZoneKind; x: number; y: number; w: number; h: number };
type Detection = { class: string; score: number; bbox: [number, number, number, number] };
type PoseEngine = { setOptions: (o: Record<string, unknown>) => void; onResults: (cb: (r: { poseLandmarks?: Point[] }) => void) => void; send: (i: { image: HTMLVideoElement }) => Promise<void>; close?: () => void };
type ObjectModel = { detect: (video: HTMLVideoElement) => Promise<Detection[]> };

declare global {
  interface Window {
    Pose?: new (opts: { locateFile: (file: string) => string }) => PoseEngine;
    cocoSsd?: { load: (base?: string) => Promise<ObjectModel> };
  }
}

const LANDMARK = { leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 };
const DEFAULT_ZONES: Zone[] = [
  { id: "bed", label: "BED / EDGE", kind: "BED", x: 0.05, y: 0.56, w: 0.37, h: 0.30 },
  { id: "stove", label: "STOVE DANGER", kind: "STOVE", x: 0.68, y: 0.18, w: 0.25, h: 0.34 },
];

function loadScript(src: string, marker: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-${marker}]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${marker}.`)), { once: true });
      if ((marker === "careguard-pose" && window.Pose) || (marker === "careguard-coco" && window.cocoSsd)) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset[marker] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${marker}.`));
    document.head.appendChild(script);
  });
}

async function ensureVisionEngines() {
  if (!window.Pose) await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js", "careguard-pose");
  if (!window.cocoSsd) {
    await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js", "careguard-tf");
    await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js", "careguard-coco");
  }
  if (!window.Pose || !window.cocoSsd) throw new Error("Browser vision engines are unavailable.");
  return { PoseCtor: window.Pose, coco: window.cocoSsd };
}

function boxesOverlap(box: { x: number; y: number; width: number; height: number }, zone: Zone) {
  const right = box.x + box.width, bottom = box.y + box.height;
  const zRight = zone.x + zone.w, zBottom = zone.y + zone.h;
  const intersection = Math.max(0, Math.min(right, zRight) - Math.max(box.x, zone.x)) * Math.max(0, Math.min(bottom, zBottom) - Math.max(box.y, zone.y));
  return intersection / Math.max(0.0001, box.width * box.height) >= 0.12;
}

export function HazardMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<PoseEngine | null>(null);
  const objectRef = useRef<ObjectModel | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectBusyRef = useRef(false);
  const historyRef = useRef<Array<{ t: number; hipY: number; torso: number }>>([]);
  const fallFramesRef = useRef(0);
  const lastAlertRef = useRef(0);
  const riskRef = useRef<Risk>("NOT STARTED");

  const [camera, setCamera] = useState<"idle" | "loading" | "live">("idle");
  const [risk, setRisk] = useState<Risk>("NOT STARTED");
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [editing, setEditing] = useState<ZoneKind | null>(null);
  const [patientZone, setPatientZone] = useState("Unresolved");
  const [motion, setMotion] = useState("Stable");
  const [confidence, setConfidence] = useState(0);
  const [fps, setFps] = useState(0);
  const [lastEvent, setLastEvent] = useState("Waiting for camera");
  const [events, setEvents] = useState<string[]>(["System ready", "No hazard signal yet"]);

  const pushEvent = useCallback((event: string) => {
    setLastEvent(event);
    setEvents(items => [`${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}  ${event}`, ...items].slice(0, 7));
  }, []);

  const setRiskState = useCallback((next: Risk, event?: string) => {
    if (riskRef.current !== next) {
      riskRef.current = next;
      setRisk(next);
      if (event) pushEvent(event);
    } else if (event && next !== "ALL SAFE") pushEvent(event);
  }, [pushEvent]);

  const alertCaregiver = useCallback(async (hazard: string, detail: string) => {
    if (Date.now() - lastAlertRef.current < 15000) return;
    lastAlertRef.current = Date.now();
    try {
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "hazard", hazard, detail }) });
    } catch (error) {
      console.error("Hazard Telegram alert failed", error);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    poseRef.current?.close?.();
    poseRef.current = null;
    objectRef.current = null;
    objectBusyRef.current = false;
    historyRef.current = [];
    fallFramesRef.current = 0;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera("idle");
    riskRef.current = "NOT STARTED";
    setRisk("NOT STARTED");
    setPatientZone("Unresolved");
    setMotion("Stable");
    setConfidence(0);
    setFps(0);
    setLastEvent("Monitoring stopped");
  }, []);

  const startCamera = useCallback(async () => {
    if (camera !== "idle") return;
    setCamera("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires localhost or HTTPS.");
      if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") throw new Error("Camera access requires localhost or HTTPS.");

      const { PoseCtor, coco } = await ensureVisionEngines();
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = media;
      const video = videoRef.current;
      if (!video) throw new Error("Camera view unavailable.");
      video.srcObject = media;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        const ready = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Camera stream could not be decoded.")); };
        const cleanup = () => { video.removeEventListener("loadedmetadata", ready); video.removeEventListener("error", failed); };
        video.addEventListener("loadedmetadata", ready, { once: true });
        video.addEventListener("error", failed, { once: true });
        if (video.readyState >= 1) ready();
      });
      await video.play();
      if (!video.videoWidth || !video.videoHeight) throw new Error("Camera opened but returned no video frames.");

      const pose = new PoseCtor({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}` });
      pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      pose.onResults(result => {
        const canvas = canvasRef.current;
        const currentVideo = videoRef.current;
        if (!canvas || !currentVideo) return;
        const width = currentVideo.videoWidth || 1280, height = currentVideo.videoHeight || 720;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, width, height);
        const points = result.poseLandmarks;
        if (!points || points.length < 25) {
          setPatientZone("No pose");
          setMotion("Pose lost");
          setRiskState("WATCH", "Pose temporarily lost");
          return;
        }

        const shoulder = { x: (points[LANDMARK.leftShoulder].x + points[LANDMARK.rightShoulder].x) / 2, y: (points[LANDMARK.leftShoulder].y + points[LANDMARK.rightShoulder].y) / 2 };
        const hip = { x: (points[LANDMARK.leftHip].x + points[LANDMARK.rightHip].x) / 2, y: (points[LANDMARK.leftHip].y + points[LANDMARK.rightHip].y) / 2 };
        const torso = Math.abs(Math.abs(Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x) * 180 / Math.PI) - 90);
        const now = Date.now();
        const history = historyRef.current;
        history.push({ t: now, hipY: hip.y, torso });
        while (history.length && now - history[0].t > 1800) history.shift();
        const first = history[0];
        const hipDrop = first ? hip.y - first.hipY : 0;
        const torsoSwing = first ? Math.abs(torso - first.torso) : 0;
        const fallCandidate = hipDrop > 0.18 && torso > 48 && torsoSwing > 16;
        const unusual = hipDrop > 0.10 || torsoSwing > 24;
        fallFramesRef.current = fallCandidate ? fallFramesRef.current + 1 : Math.max(0, fallFramesRef.current - 1);

        const pointBox = { x: Math.max(0, hip.x - 0.055), y: Math.max(0, hip.y - 0.07), width: 0.11, height: 0.14 };
        const bed = zones.find(z => z.kind === "BED"), stove = zones.find(z => z.kind === "STOVE");
        const inBed = !!bed && boxesOverlap(pointBox, bed), inStove = !!stove && boxesOverlap(pointBox, stove);
        setPatientZone(inStove ? "Stove danger zone" : inBed ? "Bed / edge zone" : "Clear area");
        setMotion(fallCandidate ? "Collapse pattern" : unusual ? "Unusual movement" : "Stable");

        if (ctx) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(103,232,249,.9)";
          points.forEach(p => { ctx.beginPath(); ctx.arc(p.x * width, p.y * height, 2.2, 0, Math.PI * 2); ctx.stroke(); });
          zones.forEach(zone => {
            ctx.strokeStyle = zone.kind === "STOVE" ? "rgba(248,113,113,.9)" : "rgba(250,204,21,.8)";
            ctx.lineWidth = 3;
            ctx.strokeRect(zone.x * width, zone.y * height, zone.w * width, zone.h * height);
          });
        }

        if (fallFramesRef.current >= 4) {
          setRiskState("HIGH RISK", "Possible fall / collapse detected");
          void alertCaregiver("FALL / COLLAPSE", "Pose analysis detected a sustained downward movement and torso change.");
        } else if (inStove) {
          setRiskState("HIGH RISK", "Patient entered stove danger zone");
          void alertCaregiver("STOVE PROXIMITY", "Patient is inside the configured stove danger zone.");
        } else if (unusual) {
          setRiskState("WATCH", "Unusual movement pattern observed");
        } else if (riskRef.current !== "HIGH RISK") {
          setRiskState("ALL SAFE");
        }
      });

      poseRef.current = pose;
      objectRef.current = await coco.load("lite_mobilenet_v2");
      historyRef.current = [];
      fallFramesRef.current = 0;
      setRiskState("ALL SAFE", "Monitoring active — no hazard detected");
      setCamera("live");

      let frameCount = 0, fpsStart = performance.now();
      const loop = async () => {
        if (!streamRef.current || !poseRef.current || !videoRef.current) return;
        try {
          await poseRef.current.send({ image: videoRef.current });
          if (!objectBusyRef.current && objectRef.current) {
            objectBusyRef.current = true;
            const detections = await objectRef.current.detect(videoRef.current);
            const person = detections.filter(d => d.class === "person" && d.score >= 0.45).sort((a, b) => b.score - a.score)[0];
            setConfidence(person?.score ?? 0);
            if (person) {
              const vw = videoRef.current.videoWidth || 1280, vh = videoRef.current.videoHeight || 720;
              const box = { x: person.bbox[0] / vw, y: person.bbox[1] / vh, width: person.bbox[2] / vw, height: person.bbox[3] / vh };
              const bed = zones.find(z => z.kind === "BED"), stove = zones.find(z => z.kind === "STOVE");
              if (stove && boxesOverlap(box, stove)) {
                setPatientZone("Stove danger zone");
                setRiskState("HIGH RISK", "Patient body entered stove danger zone");
                void alertCaregiver("STOVE PROXIMITY", "Person detection confirms body overlap with the configured stove danger zone.");
              } else if (bed && boxesOverlap(box, bed) && riskRef.current === "ALL SAFE") {
                setPatientZone("Bed / edge zone");
              }
            }
            objectBusyRef.current = false;
          }
          frameCount++;
          const elapsed = performance.now() - fpsStart;
          if (elapsed >= 1000) { setFps(Math.round(frameCount * 1000 / elapsed)); frameCount = 0; fpsStart = performance.now(); }
        } catch (error) {
          objectBusyRef.current = false;
          console.error("Hazard frame failed", error);
        }
        rafRef.current = requestAnimationFrame(() => void loop());
      };
      rafRef.current = requestAnimationFrame(() => void loop());
    } catch (error) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      poseRef.current?.close?.();
      poseRef.current = null;
      objectRef.current = null;
      setCamera("idle");
      setRiskState("NOT STARTED");
      const message = error instanceof DOMException
        ? error.name === "NotAllowedError" ? "Camera permission denied. Allow webcam access and retry."
        : error.name === "NotFoundError" ? "No webcam was found on this device."
        : error.name === "NotReadableError" ? "Webcam is busy in another application."
        : error.message || "Unable to start camera."
        : error instanceof Error ? error.message : "Unable to start camera.";
      setLastEvent(message);
    }
  }, [alertCaregiver, camera, setRiskState, zones]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const riskTone = useMemo(() => risk === "HIGH RISK" ? "border-red-400/40 bg-red-400/10 text-red-300" : risk === "WATCH" ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : risk === "ALL SAFE" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/[0.03] text-slate-300", [risk]);

  const updateZone = (kind: ZoneKind, key: "x" | "y" | "w" | "h", value: number) => setZones(items => items.map(z => z.kind === kind ? { ...z, [key]: Math.max(0, Math.min(1, value)) } : z));

  return (
    <section className="rounded-3xl border border-white/10 bg-[#0c1219] p-5 shadow-[0_24px_80px_rgba(0,0,0,.32)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-[10px] font-semibold tracking-[.22em] text-cyan-300">CAREGUARD AI · HOME SAFETY</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Hazard Monitor</h1><p className="mt-2 max-w-3xl text-sm text-slate-400">Webcam safety intelligence combining person detection, pose tracking, fall/collapse analysis, bed-edge protection and stove danger-zone monitoring.</p></div>
        <div className={`rounded-2xl border px-4 py-3 text-right ${riskTone}`}><div className="text-[9px] font-semibold tracking-[.2em] opacity-70">RISK STATE</div><div className="mt-1 text-lg font-semibold">{risk}</div></div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="relative aspect-video"><video ref={videoRef} className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]" muted playsInline /><canvas ref={canvasRef} className="absolute inset-0 h-full w-full [transform:scaleX(-1)]" />{camera !== "live" && <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(34,211,238,.08),transparent_45%)]"><div className="text-center"><div className="text-xs font-semibold tracking-[.18em] text-slate-500">CAMERA STANDBY</div><div className="mt-2 text-sm text-slate-300">Start Hazard Monitor to begin local detection.</div></div></div>}<div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-[10px] font-semibold tracking-[.16em] text-slate-300 backdrop-blur">LAPTOP WEBCAM · LOCAL PROCESSING</div><div className="absolute bottom-3 right-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2 text-[10px] text-slate-300 backdrop-blur">PERSON {confidence ? `${Math.round(confidence * 100)}%` : "—"} · {fps} FPS</div></div>
          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-4"><button onClick={camera === "live" ? stopCamera : startCamera} disabled={camera === "loading"} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-60">{camera === "live" ? "Stop monitor" : camera === "loading" ? "Starting…" : "Start monitor"}</button><span className="text-xs text-slate-500">Patient: <span className="text-slate-200">{patientZone}</span></span><span className="text-xs text-slate-500">Motion: <span className="text-slate-200">{motion}</span></span></div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[9px] tracking-[.15em] text-slate-500">CAMERA</div><div className="mt-2 text-lg font-semibold">{camera === "live" ? "LIVE" : "OFF"}</div></div><div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[9px] tracking-[.15em] text-slate-500">LATEST EVENT</div><div className="mt-2 text-xs font-semibold text-slate-200">{lastEvent}</div></div></div>
          <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">DANGER ZONES</div><div className="mt-3 space-y-3">{zones.map(zone => <div key={zone.id} className="rounded-xl border border-white/5 bg-black/20 p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{zone.label}</span><button onClick={() => setEditing(editing === zone.kind ? null : zone.kind)} className="text-[10px] font-semibold tracking-[.12em] text-cyan-300">{editing === zone.kind ? "DONE" : "CONFIGURE"}</button></div>{editing === zone.kind && <div className="mt-3 grid grid-cols-2 gap-2">{(["x", "y", "w", "h"] as const).map(key => <label key={key} className="text-[10px] text-slate-500">{key.toUpperCase()}<input type="range" min="0" max="1" step="0.01" value={zone[key]} onChange={e => updateZone(zone.kind, key, Number(e.target.value))} className="mt-1 w-full" /></label>)}</div>}</div>)}</div></div>
          <div className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">EVENT STREAM</div><div className="mt-3 space-y-2">{events.map((event, i) => <div key={`${event}-${i}`} className="border-b border-white/5 pb-2 text-xs text-slate-400 last:border-0">{event}</div>)}</div></div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">{[["Fall / collapse", "Temporal pose signals with persistence"], ["Stove proximity", "Full person-box overlap with danger zone"], ["Bed / edge", "Full person-box overlap, not just center point"]].map(([title, detail]) => <div key={title} className="rounded-2xl border border-white/10 bg-[#111923] p-4"><div className="text-[10px] font-semibold tracking-[.16em] text-slate-500">{title}</div><div className="mt-2 text-sm text-slate-300">{detail}</div></div>)}</div>
      <div className="mt-4 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] px-4 py-3 text-xs text-slate-400">Processing stays in the browser. Caregiver alerts use the existing local <code className="text-cyan-300">/api/telegram</code> route when Telegram environment variables are configured.</div>
    </section>
  );
}
