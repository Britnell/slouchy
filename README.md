# Connection steps

Both pages log these steps in order (with timestamps) into their `#log` list.

## app (`/app`)
1. `ws connected` — websocket to relay open
2. `registered → channel #123` — got uid from relay, camera URL logged too
3. `← signal offer` — received camera's WebRTC offer via relay
4. `→ signal answer` — sent answer back
5. `← signal candidate` (×N) / `→ signal candidate` (×N) — trickle ICE
6. `✔ webrtc connected` — data channel open
7. `→ {"shoulder":…,"hip":…,"ear":…,"eye":…,"nose":…}` — posture points from camera, every detected frame

## Camera pipeline
1. MediaPipe Pose Landmarker (lite) detects raw landmarks per video frame
2. landmarks are smoothed with an EMA (`LandmarkSmoother`)
3. posture points are derived from the smoothed landmarks: shoulder/hip = left–right midpoints, ear/eye/nose = front side (picked by z)
4. points (normalized x/y) are sent to app over the rtc data channel — all posture logic (angles, calibration, alerts) runs on app side

## camera (`/camera?uid=123`)
1. `ws connected` — websocket to relay open
2. `joined channel #123` — joined app's channel
3. `→ signal offer` — WebRTC offer created and sent (only after step 2, so it's not lost)
4. `← signal answer` — app's answer received
5. `→ signal candidate` (×N) / `← signal candidate` (×N) — trickle ICE
6. `✔ webrtc connected` — data channel open
7. loads pose model (lite) + camera, then `→ {"shoulder":…,"hip":…,"ear":…,"eye":…,"nose":…}` — posture points sent to app every detected frame

## Signaling notes
- Relay (`server/ws.ts`) broadcasts `signal` messages on the uid channel; clients ignore their own echoes via random `from` id.
- Multiple `candidate` lines in a row are normal (trickle ICE, one per network interface).


-[x] 1 euro smoothign filter - instead of lpf
-[ ] detect actual sitting vs standing up / background false positives in wrong rotation
