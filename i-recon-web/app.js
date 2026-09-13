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

let stream = null;
let rafId = null;

let blinkCount = 0;
let closedFrames = 0;
let openFrames = 0;
let wasClosed = false;
let lastBlinkAt = 0;
let pendingSingleBlinkTimer = null;
let pendingBlinkCount = 0;

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

const CALIBRATION = {
  eyebrowValues: [],
  mouthValues: []
};

const LEFT_EYE = { top: 159, bottom: 145, left: 130, right: 243 };
const RIGHT_EYE = { top: 386, bottom: 374, left: 263, right: 362 };
const LEFT_IRIS = { center: 468, a: 33, b: 133 };
const RIGHT_IRIS = { center: 473, a: 362, b: 263 };
const LEFT_BROW = 105;
const LEFT_LID = 159;
const RIGHT_BROW = 334;
const RIGHT_LID = 386;
const MOUTH_TOP = 13;
const MOUTH_BOTTOM = 14;
const FACE_TOP = 10;
const FACE_BOTTOM = 152;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function eyeRatio(landmarks, eye) {
  const vertical = distance(landmarks[eye.top], landmarks[eye.bottom]);
  const horizontal = distance(landmarks[eye.left], landmarks[eye.right]);
  return horizontal > 0 ? vertical / horizontal : 0;
}

function faceHeight(landmarks) {
  return Math.max(0.0001, distance(landmarks[FACE_TOP], landmarks[FACE_BOTTOM]));
}

function normalizedBrowLift(landmarks) {
  const h = faceHeight(landmarks);
  const left = distance(landmarks[LEFT_BROW], landmarks[LEFT_LID]) / h;
  const right = distance(landmarks[RIGHT_BROW], landmarks[RIGHT_LID]) / h;
  return (left + right) / 2;
}

function normalizedMouthOpening(landmarks) {
  return distance(landmarks[MOUTH_TOP], landmarks[MOUTH_BOTTOM]) / faceHeight(landmarks);
}

function irisPosition(landmarks, iris) {
  const center = landmarks[iris.center];
  const a = landmarks[iris.a];
  const b = landmarks[iris.b];
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const width = Math.max(0.0001, maxX - minX);
  return clamp((center.x - minX) / width, 0, 1);
}

function gazePosition(landmarks) {
  return (irisPosition(landmarks, LEFT_IRIS) + irisPosition(landmarks, RIGHT_IRIS)) / 2;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setCameraState(on) {
  statusPill.textContent = on ? 'Camera live' : 'Camera off';
  cameraDot.classList.toggle('live', on);
  startBtn.disabled = on;
  stopBtn.disabled = !on;
  cameraPlaceholder.style.display = on ? 'none' : 'grid';
}

function setCommand(command, trigger) {
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) return;

  const now = performance.now();
  if (command === lastCommand && now - lastCommandAt < 1300) return;

  lastCommand = command;
  lastCommandAt = now;
  lastContinuousGestureAt = now;

  commandOutputEl.textContent = command;
  commandHintEl.textContent = `Triggered by ${trigger}`;
  gestureStateEl.textContent = `${trigger}   ${command}`;

  commandOutputEl.classList.remove('flash');
  void commandOutputEl.offsetWidth;
  commandOutputEl.classList.add('flash');

  const utterance = new SpeechSynthesisUtterance(command);
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);

  fetch('/send-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command,
      trigger,
      timestamp: new Date().toISOString()
    })
  })
    .then(async response => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Alert request failed (${response.status})`);
      }
      return response.json();
    })
    .then(() => console.log('Caregiver alert sent'))
    .catch(err => console.error('Caregiver alert failed to send:', err));
}

function queueBlinkDecision() {
  pendingBlinkCount += 1;

  if (pendingSingleBlinkTimer) {
    clearTimeout(pendingSingleBlinkTimer);
    pendingSingleBlinkTimer = null;
  }

  if (pendingBlinkCount >= 2) {
    pendingBlinkCount = 0;
    setCommand('NO', 'Two blinks');
    return;
  }

  pendingSingleBlinkTimer = setTimeout(() => {
    if (pendingBlinkCount === 1) setCommand('YES', 'One blink');
    pendingBlinkCount = 0;
    pendingSingleBlinkTimer = null;
  }, 850);
}

function resetCalibration() {
  calibrationFrames = 0;
  eyebrowBaseline = 0;
  mouthBaseline = 0;
  CALIBRATION.eyebrowValues.length = 0;
  CALIBRATION.mouthValues.length = 0;
}

function resetCounters() {
  blinkCount = 0;
  closedFrames = 0;
  openFrames = 0;
  wasClosed = false;
  lastBlinkAt = 0;

  if (pendingSingleBlinkTimer) clearTimeout(pendingSingleBlinkTimer);
  pendingSingleBlinkTimer = null;
  pendingBlinkCount = 0;

  gazeCandidate = 'CENTER';
  gazeFrames = 0;
  eyebrowFrames = 0;
  mouthFrames = 0;
  lastContinuousGestureAt = 0;

  resetCalibration();

  blinkCountEl.textContent = '0';
  eyeRatioEl.textContent = '—';
  gazeStateEl.textContent = 'Center';
  commandOutputEl.textContent = 'Waiting…';
  commandHintEl.textContent = 'Enable the camera and perform a gesture.';
  gestureStateEl.textContent = stream ? 'Calibrating…' : 'Waiting for camera';
}

function drawLandmarks(face) {
  if (!face.length) return;

  ctx.save();
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = 'rgba(120, 194, 255, .9)';

  const ids = [159, 145, 130, 243, 386, 374, 263, 362, 468, 473, 105, 334, 13, 14];
  for (const id of ids) {
    const p = face[id];
    if (!p) continue;
    const x = p.x * overlay.width;
    const y = p.y * overlay.height;
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function updateCalibration(browValue, mouthValue) {
  if (calibrationFrames >= CALIBRATION_TARGET) return;

  CALIBRATION.eyebrowValues.push(browValue);
  CALIBRATION.mouthValues.push(mouthValue);
  calibrationFrames++;

  if (calibrationFrames === CALIBRATION_TARGET) {
    eyebrowBaseline = CALIBRATION.eyebrowValues.reduce((sum, value) => sum + value, 0) / CALIBRATION.eyebrowValues.length;
    mouthBaseline = CALIBRATION.mouthValues.reduce((sum, value) => sum + value, 0) / CALIBRATION.mouthValues.length;
    gestureStateEl.textContent = 'Calibration complete — perform a facial gesture';
  } else {
    gestureStateEl.textContent = `Calibrating facial baseline… ${Math.round((calibrationFrames / CALIBRATION_TARGET) * 100)}%`;
  }
}

function processBlink(ratio) {
  const CLOSED_THRESHOLD = 0.18;
  const OPEN_THRESHOLD = 0.22;

  if (ratio < CLOSED_THRESHOLD) {
    closedFrames++;
    openFrames = 0;
    if (closedFrames >= 2) {
      wasClosed = true;
      gestureStateEl.textContent = 'Eyes closed';
    }
  } else if (ratio > OPEN_THRESHOLD) {
    openFrames++;
    closedFrames = 0;

    if (wasClosed && openFrames >= 2) {
      const now = performance.now();
      if (now - lastBlinkAt > 350) {
        blinkCount++;
        blinkCountEl.textContent = String(blinkCount);
        lastBlinkAt = now;
        queueBlinkDecision();
      }
      wasClosed = false;
    } else if (calibrationFrames >= CALIBRATION_TARGET) {
      gestureStateEl.textContent = 'Eyes open';
    }
  }
}

function processGaze(landmarks) {
  if (calibrationFrames < CALIBRATION_TARGET) return;

  const x = gazePosition(landmarks);
  let candidate = 'CENTER';
  if (x < 0.39) candidate = 'LEFT';
  else if (x > 0.61) candidate = 'RIGHT';

  gazeStateEl.textContent = candidate === 'LEFT' ? 'Left' : candidate === 'RIGHT' ? 'Right' : 'Center';

  if (candidate === gazeCandidate) gazeFrames++;
  else {
    gazeCandidate = candidate;
    gazeFrames = 0;
  }

  if (gazeFrames < 7) return;
  if (performance.now() - lastContinuousGestureAt < 900) return;

  if (candidate === 'LEFT') setCommand('FOOD OR WATER', 'Looking left');
  else if (candidate === 'RIGHT') setCommand('RESTROOM', 'Looking right');

  gazeFrames = 0;
}

function processEyebrow(landmarks) {
  if (calibrationFrames < CALIBRATION_TARGET) return;

  const lift = normalizedBrowLift(landmarks);
  const threshold = eyebrowBaseline * 1.30 + 0.012;

  if (lift > threshold) eyebrowFrames++;
  else eyebrowFrames = Math.max(0, eyebrowFrames - 1);

  if (eyebrowFrames >= 8 && performance.now() - lastContinuousGestureAt > 1200) {
    setCommand('PAIN', 'Raised eyebrow');
    eyebrowFrames = 0;
  }
}

function processMouth(landmarks) {
  if (calibrationFrames < CALIBRATION_TARGET) return;

  const opening = normalizedMouthOpening(landmarks);
  const threshold = Math.max(mouthBaseline + 0.018, 0.055);

  if (opening > threshold) mouthFrames++;
  else mouthFrames = Math.max(0, mouthFrames - 1);

  if (mouthFrames >= 8 && performance.now() - lastContinuousGestureAt > 1400) {
    setCommand('CALL CAREGIVER', 'Mouth movement');
    mouthFrames = 0;
  }
}

function handleResult(results) {
  const face = results.multiFaceLandmarks?.[0];

  if (!face) {
    faceStateEl.textContent = 'Not found';
    eyeRatioEl.textContent = '—';
    gazeStateEl.textContent = '—';
    gestureStateEl.textContent = 'Move your face into view';
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    return;
  }

  faceStateEl.textContent = 'Detected';
  drawLandmarks(face);

  const left = eyeRatio(face, LEFT_EYE);
  const right = eyeRatio(face, RIGHT_EYE);
  const ratio = (left + right) / 2;
  eyeRatioEl.textContent = ratio.toFixed(3);

  const browValue = normalizedBrowLift(face);
  const mouthValue = normalizedMouthOpening(face);

  if (calibrationFrames < CALIBRATION_TARGET && ratio > 0.22) updateCalibration(browValue, mouthValue);

  processBlink(ratio);
  processGaze(face);
  processEyebrow(face);
  processMouth(face);
}

const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(handleResult);

async function startCamera() {
  clearError();

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access is unavailable. Open this site from localhost or HTTPS.');
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();
    overlay.width = video.videoWidth || 1280;
    overlay.height = video.videoHeight || 720;

    setCameraState(true);
    resetCounters();
    detectLoop();
  } catch (error) {
    const name = error?.name || 'UnknownError';

    if (name === 'NotAllowedError') showError('Camera permission was denied. Allow camera access in the browser settings and try again.');
    else if (name === 'NotFoundError') showError('No camera was found on this device.');
    else if (name === 'NotReadableError') showError('The camera is busy or unavailable. Close other apps using the camera and try again.');
    else showError(error?.message || 'Unable to start the camera.');

    setCameraState(false);
  }
}

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  if (stream) stream.getTracks().forEach((track) => track.stop());

  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  setCameraState(false);
  resetCounters();
}

async function detectLoop() {
  if (!stream) return;

  try {
    await faceMesh.send({ image: video });
  } catch (error) {
    console.error('FaceMesh error:', error);
  }

  rafId = requestAnimationFrame(detectLoop);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
resetBtn.addEventListener('click', resetCounters);
window.addEventListener('beforeunload', stopCamera);
