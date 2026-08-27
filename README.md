# posture
lets build a multi-device ai posture detection

## ai posture detection
mediapipe pose landmark detection
- example: https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/tasks/pose-landmarker.ts
- https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md
- docs : https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker

gives 33 limited points, for posture calc :
- assume camera is from side view
- L/R shoulder midpooint will give us the shoulder position
- LR hip midpoint gives hip position
- sideview only one ear will be visible, so use z to find front ear and use that as earpos
- find the front eye via z and use as eye pos
- head tilt = ear to eye pos vector
- neck tilt = ear to shoulder
- back tile = shoulder to hip


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

## laptop + smartphone
most solutions use laptop webcam, but that doesnt have the right angle
so lets use an old smartphone which can be placed for a sideways view of user. the smartphone will send the video stream to our browser running web app. then we will run ai detection on laptop in browser.

actually iphone can easily run detection too it seems, so lets test just sending over landmarks
but can we still use webrtc to not send via remote server and back, but locally on wifi via webrtc

### webrtc
so still setup webrtc connection

1. [x]we have /ws endpoint
2. [x]we have laptop /app src/pages/app.astr , and camera side app /camera src/pages/camera.astro
3. [x]app connects to websocket and registers, sends a 'connect' msg, server gives it a unique userid, sends back to app and generates a ws channel for this, app connects to that channel
4. [x]generate + display a url / path to connect camera : camera opens /camera?userid=____
5. [x]camera page grabs userid, then camera and app comunicate via this uid ws channel to connect webrtc, with no uid camera page does nothing and jsut displays msg
6. [ ]use 'simple-peer' to setup webrtc, exchange configs via ws channel
