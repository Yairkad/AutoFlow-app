package main

import (
	"fmt"
	"strings"
)

type scanError struct {
	status int
	msg    string
	code   string
}

func (e *scanError) Error() string { return e.msg }

var errorMessages = map[string]string{
	"NO_WIA":           "שירות הסריקה של Windows לא זמין במחשב הזה",
	"NO_SCANNER":       "לא נמצא סורק מחובר. ודאו שהמדפסת דולקת ומחוברת למחשב",
	"CONNECT":          "לא ניתן להתחבר לסורק %s. ודאו שהמדפסת דולקת ומחוברת",
	"OFFLINE":          "הסורק %s לא מחובר כרגע. ודאו שהמדפסת דולקת ומחוברת",
	"PAPER_EMPTY":      "אין דף לסריקה — שימו את החשבונית על הזכוכית או במזין",
	"BUSY":             "הסורק %s עסוק. אם תוכנת הסריקה של Brother (ControlCenter) פתוחה — סגרו אותה ונסו שוב",
	"DEVICE_NOT_FOUND": "הסורק שנבחר לא נמצא — בחרו סורק מחדש",
	"PAPER_JAM":        "נתקע דף במזין — שחררו אותו ונסו שוב",
}

// scriptError turns an "ERR:<code>:<detail>" line into a user-facing error.
func scriptError(last string) error {
	parts := strings.SplitN(strings.TrimPrefix(last, "ERR:"), ":", 2)
	detail := ""
	if len(parts) > 1 {
		detail = strings.TrimSpace(parts[1])
	}
	if m, ok := errorMessages[parts[0]]; ok {
		if strings.Contains(m, "%s") {
			m = strings.ReplaceAll(fmt.Sprintf(m, "\""+detail+"\""), "\"\" ", "")
		}
		return &scanError{409, m, parts[0]}
	}
	return &scanError{500, "שגיאת סריקה: " + detail, parts[0]}
}
