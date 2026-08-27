# Connection steps

Both pages log these steps in order (with timestamps) into their `#log` list.

## app (`/app`)
1. `ws connected` — websocket to relay open
2. `registered → channel #123` — got uid from relay, camera URL logged too
3. `← signal offer` — received camera's WebRTC offer via relay
4. `→ signal answer` — sent answer back
5. `← signal candidate` (×N) / `→ signal candidate` (×N) — trickle ICE
6. `✔ webrtc connected` — data channel open
7. `← {"count":n}` — JSON received from camera, once per second

## camera (`/camera?uid=123`)
1. `ws connected` — websocket to relay open
2. `joined channel #123` — joined app's channel
3. `→ signal offer` — WebRTC offer created and sent (only after step 2, so it's not lost)
4. `← signal answer` — app's answer received
5. `→ signal candidate` (×N) / `← signal candidate` (×N) — trickle ICE
6. `✔ webrtc connected` — data channel open
7. `→ {"count":n}` — sends count to app every second

## Signaling notes
- Relay (`server/ws.ts`) broadcasts `signal` messages on the uid channel; clients ignore their own echoes via random `from` id.
- Multiple `candidate` lines in a row are normal (trickle ICE, one per network interface).
