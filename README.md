React frontend (minimal)

Prereqs:
- Node 16+

Install & run:

```bash
cd frontend-react
npm install
npm run dev
```


App connects to Socket.IO server at `http://localhost:5000`. It emits `sendMessage` events and listens for `receiveMessage`.

Usage notes:
- Open the app in your browser after `npm run dev` on http://localhost:5173.
- Register or login using phone and password — the app stores a JWT and uses it to authenticate the socket connection automatically.
- After login the client joins `global-chat` and the UI will receive `receiveMessage`, `messageDelivered`, `userOnline`, and `userOffline` events.
