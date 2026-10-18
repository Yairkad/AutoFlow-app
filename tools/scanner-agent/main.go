//go:build windows

// AutoFlow Scanner — a tiny Windows background agent that lets the AutoFlow website scan
// supplier invoices straight from the office scanner (WIA), without saving files on the PC.
//
//   - First run (from Downloads etc.): installs itself to %LOCALAPPDATA%\AutoFlowScanner,
//     registers to start with Windows (HKCU Run, no admin needed) and starts.
//   - Installed run: serves http://127.0.0.1:47321
//     GET  /status          → {"ok":true,"version":"..."}
//     GET  /devices         → {"devices":[{"id":"...","name":"..."}]}  (WIA scanners)
//     POST /scan?device=<id>&source=auto|feeder|flatbed → application/pdf (all scanned pages)
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
	version = "1.1.0"
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
	// An older copy may be running — stop it so the file can be replaced (but not ourselves:
	// the downloaded installer usually has the same file name).
	killOtherCopies()
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
	killOtherCopies()
	msgBox("סורק AutoFlow הוסר.", "סורק AutoFlow", mbOK|mbIconInfo)
}

func killOtherCopies() {
	_ = hiddenCmd("taskkill", "/F", "/FI", "IMAGENAME eq "+exeName, "/FI", fmt.Sprintf("PID ne %d", os.Getpid())).Run()
}

// ── Scanning ────────────────────────────────────────────────────────────────────

// runScript runs scan.ps1 in a fresh temp folder and returns its output lines and the folder
// (the caller removes it).
func runScript(args ...string) (lines []string, tmp string, err error) {
	tmp, err = os.MkdirTemp("", "autoflow-scan-")
	if err != nil {
		return nil, "", err
	}
	script := filepath.Join(tmp, "scan.ps1")
	// UTF-8 BOM so Windows PowerShell 5 reads the script correctly
	if err := os.WriteFile(script, append([]byte{0xEF, 0xBB, 0xBF}, scanScript...), 0o600); err != nil {
		return nil, tmp, err
	}
	base := []string{"-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", script, "-out", tmp}
	out, runErr := hiddenCmd("powershell.exe", append(base, args...)...).CombinedOutput()
	text := strings.TrimSpace(strings.ReplaceAll(string(out), "\r", ""))
	log.Printf("script %v → %q (err=%v)", args, text, runErr)
	return strings.Split(text, "\n"), tmp, nil
}

type device struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func listDevices() ([]device, error) {
	scanMu.Lock()
	defer scanMu.Unlock()
	lines, tmp, err := runScript("-list")
	if tmp != "" {
		defer os.RemoveAll(tmp)
	}
	if err != nil {
		return nil, err
	}
	devs := []device{}
	for _, ln := range lines {
		ln = strings.TrimSpace(ln)
		if strings.HasPrefix(ln, "ERR:") {
			return nil, scriptError(ln)
		}
		if id, name, ok := strings.Cut(strings.TrimPrefix(ln, "DEV:"), "|"); ok && strings.HasPrefix(ln, "DEV:") {
			devs = append(devs, device{id, name})
		}
	}
	return devs, nil
}

func scan(deviceID, source string) ([]byte, error) {
	scanMu.Lock()
	defer scanMu.Unlock()

	// A busy scanner (another app, the printer waking up) usually frees up within seconds
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if attempt > 1 {
			time.Sleep(3 * time.Second)
		}
		pdf, err := scanOnce(deviceID, source)
		if se, ok := err.(*scanError); ok && se.code == "BUSY" {
			lastErr = err
			continue
		}
		return pdf, err
	}
	return nil, lastErr
}

func scanOnce(deviceID, source string) ([]byte, error) {
	lines, tmp, err := runScript("-source", source, "-dpi", scanDPI, "-device", deviceID)
	if tmp != "" {
		defer os.RemoveAll(tmp) // nothing stays on the PC
	}
	if err != nil {
		return nil, err
	}
	last := strings.TrimSpace(lines[len(lines)-1])
	if strings.HasPrefix(last, "ERR:") {
		return nil, scriptError(last)
	}
	if !strings.HasPrefix(last, "OK:") {
		return nil, &scanError{500, "שגיאת סריקה לא צפויה", "UNKNOWN"}
	}
	pages, _ := filepath.Glob(filepath.Join(tmp, "p*.jpg"))
	sort.Strings(pages)
	if len(pages) == 0 {
		return nil, &scanError{409, errorMessages["PAPER_EMPTY"], "PAPER_EMPTY"}
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

func writeError(w http.ResponseWriter, err error) {
	status, code := 500, ""
	if se, ok := err.(*scanError); ok {
		status, code = se.status, se.code
	}
	writeJSON(w, status, map[string]string{"error": err.Error(), "code": code})
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
		pdf, err := scan(r.URL.Query().Get("device"), source)
		if err != nil {
			writeError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Length", fmt.Sprint(len(pdf)))
		_, _ = w.Write(pdf)
	case "/devices":
		if origin == "" || !originAllowed(origin) {
			writeJSON(w, 403, map[string]string{"error": "הסריקה לא אושרה לאתר הזה"})
			return
		}
		devs, err := listDevices()
		if err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{"devices": devs})
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
