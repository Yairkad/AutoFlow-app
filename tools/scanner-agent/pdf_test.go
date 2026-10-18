package main

import (
	"image"
	"image/color"
	"image/jpeg"
	"os"
	"path/filepath"
	"testing"
)

func TestBuildPDF(t *testing.T) {
	dir := t.TempDir()
	var pages []string
	for i, size := range [][2]int{{1654, 2339}, {800, 600}} { // A4 @200dpi + a small page
		img := image.NewRGBA(image.Rect(0, 0, size[0], size[1]))
		for x := 0; x < size[0]; x += 7 {
			img.Set(x, x%size[1], color.RGBA{200, 0, 0, 255})
		}
		p := filepath.Join(dir, "p00"+string(rune('1'+i))+".jpg")
		f, _ := os.Create(p)
		_ = jpeg.Encode(f, img, nil)
		f.Close()
		pages = append(pages, p)
	}
	pdf, err := buildPDF(pages)
	if err != nil {
		t.Fatal(err)
	}
	out := os.Getenv("PDF_OUT")
	if out != "" {
		_ = os.WriteFile(out, pdf, 0o644)
	}
}
