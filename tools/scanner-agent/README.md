# סורק AutoFlow (scanner agent)

Small Windows background agent: the website's "📠 סרוק" button (supplier invoice lines) asks it to
scan from the office scanner (WIA — feeder if it has paper, otherwise the glass); it returns all
pages as one PDF, which the site uploads to Drive like a normal attachment. Nothing is kept on the PC.

- Double-click the exe → installs to `%LOCALAPPDATA%\AutoFlowScanner`, starts with Windows (HKCU Run).
- Listens on `http://127.0.0.1:47321` (`GET /status`, `GET /devices`, `POST /scan?device=<id>&source=auto|feeder|flatbed`).
- The site remembers the chosen scanner per computer (localStorage); "החלף סורק" re-picks. Busy scanner → 3 tries, 3s apart.
- Each website origin must be approved once (Yes/No dialog); approvals in `config.json`, log in `log.txt`.
- Uninstall: `"%LOCALAPPDATA%\AutoFlowScanner\autoflow-scanner.exe" --uninstall`.

Build (from any OS) — output is served by the site at `/downloads/autoflow-scanner.exe`:

```sh
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H=windowsgui" -o ../../public/downloads/autoflow-scanner.exe .
go test ./...   # PDF builder
```
