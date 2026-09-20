# RSET Campus Navigator — starter

This starter uses your uploaded `main_block.gltf` and a React + Three.js frontend.

## Run
```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Important positioning note
The included live-tracking button is a UI/simulation layer only. Reliable indoor positioning should NOT be implemented with GPS alone. For the real deployment, use a positioning layer such as:
- BLE beacons + phone RSSI
- Wi-Fi RTT where supported
- UWB where available
- QR checkpoints as a low-cost fallback
- phone IMU step/heading data + map matching

The production architecture should send normalized positions to the backend as:
`{ userId, floor, x, y, accuracy, heading, timestamp, source }`

Then a route engine can detect deviation from the corridor graph and recalculate.

## Floor mapping
The floor plans supplied are used as the room-directory source. The GLTF is the 3D visual layer. Before final deployment, calibrate each floor's 2D coordinate system against the corresponding 3D floor slice using 3-5 shared landmarks (stairs, lift, courtyard corners). Do not rely on visual scaling alone.

## Suggested production stack
Frontend: React + Vite + React Three Fiber
Backend: FastAPI or Node/Express
Database: PostgreSQL + PostGIS
Realtime: WebSocket
Auth: Firebase/Auth0/custom JWT
Positioning: BLE/Wi-Fi RTT/UWB/QR
Routing: graph over walkable corridors + stairs/lifts

## Supplied floor-plan assets
- `public/ground-plan.jpg`
- `public/first-plan.jpg`
- `public/second-plan.jpg`
- `public/third-plan.jpg`

The ground image is the supplied colored campus map; the other three are the first/second/third floor drawings.
