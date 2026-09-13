# i-Recon Web — Local Facial Gesture + Fall Hazard Detection

This folder contains the standalone browser-based i-Recon facial gesture prototype, pose-based fall hazard detection, and a small local Node.js server for caregiver Telegram alerts.

## Run locally

Open `Master_Repo/i-recon-web` in VS Code.

Create a local `.env` file in this folder with:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
PORT=3000
```

Do not commit `.env`.

Then run:

```bash
npm start
```

Open `http://localhost:3000`.

Check the server with `http://localhost:3000/health`.

## Communication flow

Facial gestures generate patient communication commands and add them to the Communication feed. A confirmed fall is treated as a critical Communication event and is also sent through `POST /send-alert` to the configured caregiver Telegram channel.

The browser never contains the Telegram bot token. The local server reads the credentials from `.env` and sends the Telegram alert.

## Fall detection

MediaPipe Pose runs locally in the browser. The prototype combines rapid downward hip movement with a collapsed/horizontal posture and a short persistence window before creating a fall event. A 30-second cooldown prevents repeated alerts from the same incident.

This is a prototype heuristic, not a clinically validated fall-detection model.

## Gesture mappings

- 1 blink → YES
- 2 blinks → NO
- Look left → FOOD OR WATER
- Look right → RESTROOM
- Raise eyebrow → PAIN
- Mouth movement → CALL CAREGIVER

## Note

This remains an engineering prototype and is not a medical device. Facial gesture and fall thresholds should be calibrated and validated for the intended user and environment.
