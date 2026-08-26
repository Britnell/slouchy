# posture
lets build a multi-device ai posture detection

## ai posture detection
mediapipe pose landmark detection
- https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/pose-landmarker.ts
- https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md


## laptop + smartphone
most solutions use laptop webcam, but that doesnt have the right angle
so lets use an old smartphone which can be placed for a sideways view of user. the smartphone will send the video stream to our browser running web app. then we will run ai detection on laptop in browser.

## bun + websocket + astro
- **astro** (ssr / api endpoints) hosts the web app
- **bun** (`Bun.serve`, native websockets, no framework) runs a small ws relay: phone sends jpeg frames, bun broadcasts them to the laptop
- dev: vite proxies `/ws` to the bun port; prod: same origin, no proxy needed

## local https (required for camera on phone)
getUserMedia needs a secure context — localhost is exempt, but the phone hits the dev server over LAN, so it needs https via mkcert:

```bash
mkcert -install                          # installs local CA (laptop trusts it)
mkdir .certs && cd .certs
mkcert localhost 192.168.x.x laptop.local # mint cert (LAN ip + hostname)
```
- point astro/vite `server.https` at the `.certs/*.pem` files, `server.host: true`
- one-time on the phone: copy `rootCA.pem` (from `mkcert -CAROOT`), install it (android: security → install cert; ios: install profile + enable full trust in about → certificate trust settings). then no warnings, camera works
- `.certs/` in .gitignore
