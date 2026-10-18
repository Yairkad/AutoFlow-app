package main

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"os"
	"strings"
)

const (
	scanDPI  = "200" // passed to the WIA script and used to size PDF pages
	jpegQual = 70    // re-encode quality, keeps multi-page invoices under the upload limit
)

// ── PDF from JPEG pages (each page is the image, sized at scanDPI) ─────────────────

func buildPDF(pages []string) ([]byte, error) {
	type pg struct {
		data       []byte
		w, h       int
		colorSpace string
	}
	var list []pg
	for _, p := range pages {
		raw, err := os.ReadFile(p)
		if err != nil {
			return nil, err
		}
		// Re-encode smaller so multi-page invoices stay under the website's upload limit
		img, _, err := image.Decode(bytes.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("decode page: %w", err)
		}
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: jpegQual}); err != nil {
			return nil, err
		}
		cs := "/DeviceRGB"
		if _, gray := img.(*image.Gray); gray {
			cs = "/DeviceGray"
		}
		b := img.Bounds()
		list = append(list, pg{buf.Bytes(), b.Dx(), b.Dy(), cs})
	}

	var out bytes.Buffer
	offsets := []int{0}
	obj := func(body func()) {
		offsets = append(offsets, out.Len())
		fmt.Fprintf(&out, "%d 0 obj\n", len(offsets)-1)
		body()
		out.WriteString("\nendobj\n")
	}
	out.WriteString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")

	// 1 = catalog, 2 = pages, then per page: page, image, content
	n := len(list)
	kids := make([]string, n)
	for i := range list {
		kids[i] = fmt.Sprintf("%d 0 R", 3+i*3)
	}
	obj(func() { out.WriteString("<< /Type /Catalog /Pages 2 0 R >>") })
	obj(func() { fmt.Fprintf(&out, "<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), n) })
	dpi := 200.0
	fmt.Sscanf(scanDPI, "%g", &dpi)
	for i, p := range list {
		w := float64(p.w) * 72 / dpi
		h := float64(p.h) * 72 / dpi
		imgRef, contentRef := 4+i*3, 5+i*3
		obj(func() {
			fmt.Fprintf(&out, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>",
				w, h, imgRef, contentRef)
		})
		obj(func() {
			fmt.Fprintf(&out, "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace %s /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n",
				p.w, p.h, p.colorSpace, len(p.data))
			out.Write(p.data)
			out.WriteString("\nendstream")
		})
		content := fmt.Sprintf("q %.2f 0 0 %.2f 0 0 cm /Im0 Do Q", w, h)
		obj(func() {
			fmt.Fprintf(&out, "<< /Length %d >>\nstream\n%s\nendstream", len(content), content)
		})
	}

	xref := out.Len()
	fmt.Fprintf(&out, "xref\n0 %d\n0000000000 65535 f \n", len(offsets))
	for _, off := range offsets[1:] {
		fmt.Fprintf(&out, "%010d 00000 n \n", off)
	}
	fmt.Fprintf(&out, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets), xref)
	return out.Bytes(), nil
}
