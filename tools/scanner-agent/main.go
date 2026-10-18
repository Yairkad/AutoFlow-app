//go:build windows

// AutoFlow Scanner — a tiny Windows background agent that lets the AutoFlow website scan
// supplier invoices straight from the office scanner (WIA), without saving files on the PC.
//
//   - First run (from Downloads etc.): installs itself to %LOCALAPPDATA%\AutoFlowScanner,
//     registers to start with Windows (HKCU Run, no admin needed) and starts.
//   - Installed run: serves http://127.0.0.1:47321
//     GET  /status          → {"ok":true,"version":"..."}
//     POST /scan?source=auto|feeder|flatbed → application/pdf (all scanned pages)
//   - "--uninstall": removes the startup entry and the installed copy.
//
// A website may scan only after the user approved its origin once (Windows Yes/No dialog).
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	version = "1.0.0"
	listen  = "127.0.0.1:47321"
	appName = "AutoFlowScanner"
	exeName = "autoflow-scanner.exe"
	runKey  = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
)

//go:embed scan.ps1
var scanScript []byte

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
	scanMu      sync.Mutex
	cfgMu       sync.Mutex
)

// ── Paths / config ──────────────────────────────────────────────────────────────

func appDir() string { return filepath.Join(os.Getenv("LOCALAPPDATA"), appName) }

type config struct {
	AllowedOrigins []string `json:"allowedOrigins"`
}

func loadConfig() config {
	var c config
	b, err := os.ReadFile(filepath.Join(appDir(), "config.json"))
	if err == nil {
		_ = json.Unmarshal(b, &c)
	}
	return c
}

func saveConfig(c config) {
	b, _ := json.MarshalIndent(c, "", "  ")
	_ = os.WriteFile(filepath.Join(appDir(), "config.json"), b, 0o600)
}

// ── Windows dialogs ─────────────────────────────────────────────────────────────

const (
	mbOK         = 0x0
	mbYesNo      = 0x4
	mbIconInfo   = 0x40
	mbIconQuest  = 0x20
	mbIconError  = 0x10
	mbTopmost    = 0x40000
	mbForeground = 0x10000
	mbRight      = 0x80000
	mbRTLReading = 0x100000
	idYes        = 6
)

func msgBox(text, title string, flags uintptr) int {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(title)
	r, _, _ := messageBoxW.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)),
		flags|mbTopmost|mbForeground|mbRight|mbRTLReading)
	return int(r)
}

// ── Install / uninstall ─────────────────────────────────────────────────────────

func hiddenCmd(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return cmd
}

func install(self string) {
	dir := appDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		msgBox("ההתקנה נכשלה: "+err.Error(), "סורק AutoFlow", mbOK|mbIconError)
		return
	}
	target := filepath.Join(dir, exeName)
	// An older copy may be running — stop it so the file can be replaced.
	_ = hiddenCmd("taskkill", "/F", "/IM", exeName).Run()
	time.Sleep(500 * time.Millisecond)
	src, err := os.ReadFile(self)
	if err == nil {
		err = os.WriteFile(target, src, 0o755)
	}
	if err != nil {
		msgBox("ההתקנה נכשלה: "+err.Error(), "סורק AutoFlow", mbOK|mbIconError)
		return
	}
	_ = hiddenCmd("reg", "add", runKey, "/v", appName, "/t", "REG_SZ", "/d", `"`+target+`"`, "/f").Run()
	_ = exec.Command(target).Start()
	msgBox("סורק AutoFlow הותקן ופועל ברקע.\nהוא יעלה אוטומטית עם הפעלת המחשב.\n\nעכשיו אפשר ללחוץ \"📠 סרוק\" בחלון החשבונית באתר.",
		"סורק AutoFlow", mbOK|mbIconInfo)
}

func uninstall() {
	_ = hiddenCmd("reg", "delete", runKey, "/v", appName, "/f").Run()
	// The running copy can't delete itself — schedule removal of the folder after it exits.
	_ = hiddenCmd("cmd", "/C", "timeout /T 2 >NUL & rmdir /S /Q \""+appDir()+"\"").Start()
	msgBox("סורק AutoFlow הוסר.", "סורק AutoFlow", mbOK|mbIconInfo)
	_ = hiddenCmd("taskkill", "/F", "/IM", exeName).Start()
}

// ── Scanning ────────────────────────────────────────────────────────────────────

type scanError struct {
	status int
	msg    string
}

func (e *scanError) Error() string { return e.msg }

var errorMessages = map[string]string{
	"NO_WIA":      "שירות הסריקה של Windows לא זמין במחשב הזה",
	"NO_SCANNER":  "לא נמצא סורק מחובר. ודאו שהמדפסת דולקת ומחוברת למחשב",
	"CONNECT":     "לא ניתן להתחבר לסורק. ודאו שהמדפסת דולקת ושאין סריקה אחרת פעילה",
	"PAPER_EMPTY": "אין דף לסריקה — שימו את החשבונית על הזכוכית או במזין",
	"BUSY":        "הסורק עסוק — נסו שוב בעוד רגע",
	"PAPER_JAM":   "נתקע דף במזין — שחררו אותו ונסו שוב",
}

func scan(source string) ([]byte, error) {
	scanMu.Lock()
	defer scanMu.Unlock()

	tmp, err := os.MkdirTemp("", "autoflow-scan-")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmp) // nothing stays on the PC

	script := filepath.Join(tmp, "scan.ps1")
	// UTF-8 BOM so Windows PowerShell 5 reads the script correctly
	if err := os.WriteFile(script, append([]byte{0xEF, 0xBB, 0xBF}, scanScript...), 0o600); err != nil {
		return nil, err
	}
	out, err := hiddenCmd("powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass",
		"-File", script, "-out", tmp, "-source", source, "-dpi", scanDPI).CombinedOutput()
	text := strings.TrimSpace(string(out))
	log.Printf("scan source=%s result=%q err=%v", source, text, err)

	lines := strings.Split(text, "\n")
	last := strings.TrimSpace(lines[len(lines)-1])
	if strings.HasPrefix(last, "ERR:") {
		parts := strings.SplitN(strings.TrimPrefix(last, "ERR:"), ":", 2)
		if m, ok := errorMessages[parts[0]]; ok {
			return nil, &scanError{409, m}
		}
		detail := ""
		if len(parts) > 1 {
			detail = parts[1]
		}
		return nil, &scanError{500, "שגיאת סריקה: " + strings.TrimSpace(detail)}
	}
	if !strings.HasPrefix(last, "OK:") {
		return nil, &scanError{500, "שגיאת סריקה לא צפויה"}
	}

	pages, _ := filepath.Glob(filepath.Join(tmp, "p*.jpg"))
	sort.Strings(pages)
	if len(pages) == 0 {
		return nil, &scanError{409, errorMessages["PAPER_EMPTY"]}
	}
	return buildPDF(pages)
}

// ── HTTP ────────────────────────────────────────────────────────────────────────

func originAllowed(origin string) bool {
	cfgMu.Lock()
	defer cfgMu.Unlock()
	c := loadConfig()
	for _, o := range c.AllowedOrigins {
		if o == origin {
			return true
		}
	}
	if !strings.HasPrefix(origin, "https://") && !strings.HasPrefix(origin, "http://localhost") {
		return false
	}
	if msgBox("האתר הבא מבקש להשתמש בסורק של המחשב:\n\n"+origin+"\n\nלאפשר לו לסרוק חשבוניות?", "סורק AutoFlow", mbYesNo|mbIconQuest) != idYes {
		return false
	}
	c.AllowedOrigins = append(c.AllowedOrigins, origin)
	saveConfig(c)
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func handler(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		// Chrome: allow a public https site to reach this local service
		w.Header().Set("Access-Control-Allow-Private-Network", "true")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	switch r.URL.Path {
	case "/status":
		writeJSON(w, 200, map[string]any{"ok": true, "version": version})
	case "/scan":
		if r.Method != http.MethodPost {
			writeJSON(w, 405, map[string]string{"error": "method"})
			return
		}
		if origin == "" || !originAllowed(origin) {
			writeJSON(w, 403, map[string]string{"error": "הסריקה לא אושרה לאתר הזה"})
			return
		}
		source := r.URL.Query().Get("source")
		if source != "feeder" && source != "flatbed" {
			source = "auto"
		}
		pdf, err := scan(source)
		if err != nil {
			status := 500
			if se, ok := err.(*scanError); ok {
				status = se.status
			}
			writeJSON(w, status, map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Length", fmt.Sprint(len(pdf)))
		_, _ = w.Write(pdf)
	default:
		writeJSON(w, 404, map[string]string{"error": "not found"})
	}
}

func serve() {
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return // already running
	}
	if f, err := os.OpenFile(filepath.Join(appDir(), "log.txt"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600); err == nil {
		log.SetOutput(f)
	}
	log.Printf("AutoFlow Scanner %s listening on %s", version, listen)
	srv := &http.Server{Handler: http.HandlerFunc(handler), ReadHeaderTimeout: 10 * time.Second}
	_ = srv.Serve(ln)
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--uninstall" {
		uninstall()
		return
	}
	self, _ := os.Executable()
	if !strings.EqualFold(filepath.Dir(self), appDir()) {
		install(self)
		return
	}
	serve()
}
