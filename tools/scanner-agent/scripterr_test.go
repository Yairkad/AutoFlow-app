package main

import "testing"

func TestScriptErrorMessages(t *testing.T) {
	cases := map[string]string{
		"ERR:BUSY:Brother MFC-L2710DW": `הסורק "Brother MFC-L2710DW" עסוק. אם תוכנת הסריקה של Brother (ControlCenter) פתוחה — סגרו אותה ונסו שוב`,
		"ERR:BUSY:":                    `הסורק עסוק. אם תוכנת הסריקה של Brother (ControlCenter) פתוחה — סגרו אותה ונסו שוב`,
		"ERR:PAPER_EMPTY:":             errorMessages["PAPER_EMPTY"],
		"ERR:SCAN:80004005 boom":       "שגיאת סריקה: 80004005 boom",
	}
	for in, want := range cases {
		if got := scriptError(in).Error(); got != want {
			t.Errorf("%s: got %q want %q", in, got, want)
		}
	}
}
