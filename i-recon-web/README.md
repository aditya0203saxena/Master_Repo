# i-Recon Web — Local Facial Gesture Controls

This folder contains the standalone browser-based i-Recon facial gesture prototype and a small local Node.js server for caregiver Telegram alerts.

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

## Alert flow

The browser never contains the Telegram bot token. Gesture commands are sent to `POST /send-alert` on the local server, and the server sends the alert to Telegram using the local environment variables.

## Gesture mappings

- 1 blink → YES
- 2 blinks → NO
- Look left → FOOD OR WATER
- Look right → RESTROOM
- Raise eyebrow → PAIN
- Mouth movement → CALL CAREGIVER

## Note

This remains an engineering prototype and is not a medical device. Facial gesture thresholds should be calibrated and validated for the intended user.
