const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const statusPill = document.getElementById('statusPill');
const cameraDot = document.getElementById('cameraDot');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const errorBox = document.getElementById('errorBox');
const blinkCountEl = document.getElementById('blinkCount');
const eyeRatioEl = document.getElementById('eyeRatio');
const faceStateEl = document.getElementById('faceState');
const gazeStateEl = document.getElementById('gazeState');
const gestureStateEl = document.getElementById('gestureState');
const commandOutputEl = document.getElementById('commandOutput');
const commandHintEl = document.getElementById('commandHint');
const hazardStatusEl = document.getElementById('hazardStatus');
const hazardTypeEl = document.getElementById('hazardType');
const hazardConfidenceEl = document.getElementById('hazardConfidence');
const postureStateEl = document.getElementById('postureState');
const messageFeedEl = document.getElementById('messageFeed');
const messageEmptyEl = document.getElementById('messageEmpty');
const messageCountEl = document.getElementById('messageCount');

let stream = null;
let rafId = null;
let pose = null;
let poseReady = false;
let poseBusy = false;
let lastPoseAt = 0;
let lastFallAlertAt = 0;
const FALL_COOLDOWN = 30000;

let blinkCount = 0;
let closedFrames = 0;
let openFrames = 0;
let wasClosed = false;
let lastBlinkAt = 0;
let pendingBlinkCount = 0;
let pendingBlinkTimer = null;
let lastCommand = '';
let lastCommandAt = 0;
let gazeCandidate = 'CENTER';
let gazeFrames = 0;
let eyebrowFrames = 0;
let mouthFrames = 0;
let lastContinuousGestureAt = 0;
let calibrationFrames = 0;
const CALIBRATION_TARGET = 45;
let eyebrowBaseline = 0;
let mouthBaseline = 0;
const eyebrowValues = [];
const mouthValues = [];
const poseHistory = [];

const LEFT_EYE = { top: 159, bottom: 145, left: 130, right: 243 };
const RIGHT_EYE = { top: 386, bottom: 374, left: 263, right: 362 };
const LEFT_IRIS = { center: 468, a: 33, b: 133 };
const RIGHT_IRIS = { center: 473, a: 362, b: 263 };
const POSE = { NOSE: 0, LS: 11, RS: 12, LH: 23, RH: 24, LK: 25, RK: 26, LA: 27, RA: 28 };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const avg = (landmarks, a, b) => {
  const p = landmarks[a], q = landmarks[b];
  if (!p || !q || Math.min(p.visibility ?? 1, q.visibility ?? 1) < 0.45) return null;
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
};
const faceHeight = f => Math.max(0.0001, dist(f[10], f[152]));
const eyeRatio = (f, eye) => dist(f[eye.top], f[eye.bottom]) / Math.max(0.0001, dist(f[eye.left], f[eye.right]));
const browLift = f => (dist(f[105], f[159]) + dist(f[334], f[386])) / 2 / faceHeight(f);
const mouthOpen = f => dist(f[13], f[14]) / faceHeight(f);
const irisPosition = (f, eye) => {
  const c = f[eye.center], a = f[eye.a], b = f[eye.b];
  return clamp((c.x - Math.min(a.x, b.x)) / Math.max(0.0001, Math.max(a.x, b.x) - Math.min(a.x, b.x)), 0, 1);
};
const gazePosition = f => (irisPosition(f, LEFT_IRIS) + irisPosition(f, RIGHT_IRIS)) / 2;

function showError(message) { errorBox.textContent = message; errorBox.hidden = false; }
function clearError() { errorBox.textContent = ''; errorBox.hidden = true; }
function setCameraState(on) {
  statusPill.textContent = on ? 'Camera live' : 'Camera off';
  cameraDot.classList.toggle('live', on);
  startBtn.disabled = on;
  stopBtn.disabled = !on;
  cameraPlaceholder.style.display = on ? 'none' : 'grid';
}

function addCommunicationMessage(title, detail, critical = false) {
  messageEmptyEl?.remove();
  const item = document.createElement('div');
  item.className = `message-item${critical ? ' critical' : ''}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `<div class="message-top"><span>Communication</span><span>${time}</span></div><strong>${title}</strong><p>${detail}</p>`;
  messageFeedEl.prepend(item);
  const count = messageFeedEl.querySelectorAll('.message-item').length;
  messageCountEl.textContent = `${count} ${count === 1 ? 'event' : 'events'}`;
  while (messageFeedEl.children.length > 8) messageFeedEl.lastElementChild.remove();
}

function sendAlert(command, trigger, alertType = 'communication') {
  fetch('/send-alert', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, trigger, alertType, timestamp: new Date().toISOString() })
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Alert failed (${r.status})`);
  }).catch(err => console.error('Caregiver alert failed:', err));
}

function setCommand(command, trigger) {
  const now = performance.now();
  if (command === lastCommand && now - lastCommandAt < 1300) return;
  lastCommand = command; lastCommandAt = now; lastContinuousGestureAt = now;
  commandOutputEl.textContent = command;
  commandHintEl.textContent = `Triggered by ${trigger}`;
  gestureStateEl.textContent = `${trigger}   ${command}`;
  addCommunicationMessage(command, `Patient communication request triggered by ${trigger}.`);
  commandOutputEl.classList.remove('flash'); void commandOutputEl.offsetWidth; commandOutputEl.classList.add('flash');
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(command); utterance.rate = 0.9; window.speechSynthesis.speak(utterance);
  }
  sendAlert(command, trigger);
}

function queueBlinkDecision() {
  pendingBlinkCount++;
  clearTimeout(pendingBlinkTimer);
  if (pendingBlinkCount >= 2) { pendingBlinkCount = 0; setCommand('NO', 'Two blinks'); return; }
  pendingBlinkTimer = setTimeout(() => { if (pendingBlinkCount === 1) setCommand('YES', 'One blink'); pendingBlinkCount = 0; }, 850);
}

function updateCalibration(brow, mouth) {
  if (calibrationFrames >= CALIBRATION_TARGET) return;
  eyebrowValues.push(brow); mouthValues.push(mouth); calibrationFrames++;
  if (calibrationFrames === CALIBRATION_TARGET) {
    eyebrowBaseline = eyebrowValues.reduce((a, b) => a + b, 0) / eyebrowValues.length;
    mouthBaseline = mouthValues.reduce((a, b) => a + b, 0) / mouthValues.length;
    gestureStateEl.textContent = 'Calibration complete — perform a facial gesture';
  } else gestureStateEl.textContent = `Calibrating facial baseline… ${Math.round(calibrationFrames / CALIBRATION_TARGET * 100)}%`;
}

function processFaceBlink(ratio) {
  if (ratio < 0.18) { closedFrames++; openFrames = 0; if (closedFrames >= 2) wasClosed = true; }
  else if (ratio > 0.22) {
    openFrames++; closedFrames = 0;
    if (wasClosed && openFrames >= 2) {
      const now = performance.now();
      if (now - lastBlinkAt > 350) { blinkCount++; blinkCountEl.textContent = String(blinkCount); lastBlinkAt = now; queueBlinkDecision(); }
      wasClosed = false;
    }
  }
}

function processGaze(f) {
  if (calibrationFrames < CALIBRATION_TARGET) return;
  const x = gazePosition(f);
  const candidate = x < 0.39 ? 'LEFT' : x > 0.61 ? 'RIGHT' : 'CENTER';
  gazeStateEl.textContent = candidate === 'LEFT' ? 'Left' : candidate === 'RIGHT' ? 'Right' : 'Center';
  gazeFrames = candidate === gazeCandidate ? gazeFrames + 1 : 0; gazeCandidate = candidate;
  if (gazeFrames >= 7 && performance.now() - lastContinuousGestureAt > 900) {
    if (candidate === 'LEFT') setCommand('FOOD OR WATER', 'Looking left');
    if (candidate === 'RIGHT') setCommand('RESTROOM', 'Looking right');
    gazeFrames = 0;
  }
}

function processEyebrow(f) {
  if (calibrationFrames < CALIBRATION_TARGET) return;
  const active = browLift(f) > eyebrowBaseline * 1.3 + 0.012;
  eyebrowFrames = active ? eyebrowFrames + 1 : Math.max(0, eyebrowFrames - 1);
  if (eyebrowFrames >= 8 && performance.now() - lastContinuousGestureAt > 1200) { setCommand('PAIN', 'Raised eyebrow'); eyebrowFrames = 0; }
}

function processMouth(f) {
  if (calibrationFrames < CALIBRATION_TARGET) return;
  const active = mouthOpen(f) > Math.max(mouthBaseline + 0.018, 0.055);
  mouthFrames = active ? mouthFrames + 1 : Math.max(0, mouthFrames - 1);
  if (mouthFrames >= 8 && performance.now() - lastContinuousGestureAt > 1400) { setCommand('CALL CAREGIVER', 'Mouth movement'); mouthFrames = 0; }
}

function drawFacePoints(face) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = 'rgba(120,194,255,.9)';
  for (const id of [159,145,130,243,386,374,263,362,468,473,105,334,13,14]) {
    const p = face[id]; if (!p) continue;
    ctx.beginPath(); ctx.arc(p.x * overlay.width, p.y * overlay.height, 2.7, 0, Math.PI * 2); ctx.fill();
  }
}

function handleFaceResults(results) {
  const face = results.multiFaceLandmarks?.[0];
  if (!face) { faceStateEl.textContent = 'Not found'; eyeRatioEl.textContent = '—'; gazeStateEl.textContent = '—'; return; }
  faceStateEl.textContent = 'Detected'; drawFacePoints(face);
  const ratio = (eyeRatio(face, LEFT_EYE) + eyeRatio(face, RIGHT_EYE)) / 2;
  eyeRatioEl.textContent = ratio.toFixed(3);
  const b = browLift(face), m = mouthOpen(face);
  if (ratio > 0.22 && calibrationFrames < CALIBRATION_TARGET) updateCalibration(b, m);
  processFaceBlink(ratio); processGaze(face); processEyebrow(face); processMouth(face);
}

function resetCounters() {
  blinkCount = closedFrames = openFrames = 0; wasClosed = false; lastBlinkAt = 0; pendingBlinkCount = 0; clearTimeout(pendingBlinkTimer);
  gazeCandidate = 'CENTER'; gazeFrames = eyebrowFrames = mouthFrames = 0; lastContinuousGestureAt = 0;
  calibrationFrames = 0; eyebrowBaseline = mouthBaseline = 0; eyebrowValues.length = 0; mouthValues.length = 0; poseHistory.length = 0;
  hazardStatusEl.textContent = 'MONITORING'; hazardStatusEl.className = 'hazard-badge safe'; hazardTypeEl.textContent = 'None'; hazardConfidenceEl.textContent = '—'; postureStateEl.textContent = 'Unknown';
  blinkCountEl.textContent = '0'; eyeRatioEl.textContent = '—'; gazeStateEl.textContent = 'Center'; commandOutputEl.textContent = 'Waiting…'; commandHintEl.textContent = 'Enable the camera and perform a gesture.'; gestureStateEl.textContent = stream ? 'Calibrating…' : 'Waiting for camera';
}

async function initPose() {
  if (poseReady || !window.Pose) return;
  pose = new Pose({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}` });
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
  pose.onResults(results => { if (results.poseLandmarks) evaluateFall(results.poseLandmarks, performance.now()); });
  poseReady = true;
}

function evaluateFall(lm, now) {
  const shoulders = avg(lm, POSE.LS, POSE.RS), hips = avg(lm, POSE.LH, POSE.RH), knees = avg(lm, POSE.LK, POSE.RK), ankles = avg(lm, POSE.LA, POSE.RA), nose = lm[POSE.NOSE];
  if (!shoulders || !hips || !knees || !ankles || !nose) return;
  const body = Math.max(0.08, Math.abs(ankles.y - nose.y));
  const torsoAngle = Math.abs(Math.atan2(shoulders.x - hips.x, shoulders.y - hips.y) * 180 / Math.PI);
  const hipHeight = Math.abs(ankles.y - hips.y) / body;
  const kneeHeight = Math.abs(ankles.y - knees.y) / body;
  const horizontal = torsoAngle > 55;
  const low = hipHeight < 0.34 && kneeHeight < 0.42;
  const upright = torsoAngle < 35 && hipHeight > 0.35;
  poseHistory.push({ t: now, y: hips.y });
  while (poseHistory.length && now - poseHistory[0].t > 1400) poseHistory.shift();
  const old = poseHistory.find(p => now - p.t > 420);
  const fastDrop = old ? hips.y - old.y > 0.09 : false;
  const recent = poseHistory.filter(p => now - p.t < 900);
  const sustainedDown = recent.length >= 5 && (horizontal || low);
  let score = 0;
  if (fastDrop) score += 55; if (horizontal) score += 20; if (low) score += 15; if (hipHeight < 0.28) score += 10; if (sustainedDown) score += 10;
  postureStateEl.textContent = upright ? 'Upright' : (horizontal || low ? 'Down / collapsed' : 'Moving');
  const confidence = Math.min(99, score);
  hazardConfidenceEl.textContent = confidence ? `${confidence}%` : '—';
  if (upright) { hazardStatusEl.textContent = 'MONITORING'; hazardStatusEl.className = 'hazard-badge safe'; hazardTypeEl.textContent = 'None'; return; }
  if (score >= 70 && fastDrop && (horizontal || low) && now - lastFallAlertAt > FALL_COOLDOWN) {
    lastFallAlertAt = now; hazardStatusEl.textContent = 'FALL ALERT'; hazardStatusEl.className = 'hazard-badge critical'; hazardTypeEl.textContent = 'Fall detected';
    const detail = `Possible fall detected by pose analysis (${Math.max(85, confidence)}% confidence). Check the patient immediately.`;
    addCommunicationMessage('FALL DETECTED', detail, true);
    sendAlert('FALL DETECTED', detail, 'hazard');
  } else if (score >= 45) { hazardStatusEl.textContent = 'ELEVATED'; hazardStatusEl.className = 'hazard-badge warn'; hazardTypeEl.textContent = 'Movement risk'; }
}

const faceMesh = new FaceMesh({ locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}` });
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
faceMesh.onResults(handleFaceResults);
initPose();

async function startCamera() {
  clearError();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Open this site from localhost or HTTPS.');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream; await video.play(); overlay.width = video.videoWidth || 1280; overlay.height = video.videoHeight || 720;
    setCameraState(true); resetCounters(); detectLoop();
  } catch (error) {
    const name = error?.name;
    showError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : name === 'NotFoundError' ? 'No camera was found on this device.' : name === 'NotReadableError' ? 'The camera is busy or unavailable.' : error?.message || 'Unable to start the camera.');
    setCameraState(false);
  }
}

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId); rafId = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; ctx.clearRect(0, 0, overlay.width, overlay.height); setCameraState(false); resetCounters();
}

async function detectLoop() {
  if (!stream) return;
  try {
    await faceMesh.send({ image: video });
    const now = performance.now();
    if (pose && poseReady && !poseBusy && now - lastPoseAt > 90) { poseBusy = true; lastPoseAt = now; await pose.send({ image: video }).finally(() => { poseBusy = false; }); }
  } catch (error) { console.error('Vision frame error:', error); }
  rafId = requestAnimationFrame(detectLoop);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
resetBtn.addEventListener('click', resetCounters);
window.addEventListener('beforeunload', stopCamera);
