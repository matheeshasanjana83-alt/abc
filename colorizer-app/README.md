# SPECTRA Color Studio

A dependency-free HTML/CSS/JS palette colorizer for **adult fictional anime-style artwork**. It runs entirely in the browser—there is no upload endpoint, account system, or storage layer.

## Run locally

From the repository root:

```bash
python3 -m http.server 8080 --directory colorizer-app
```

Open `http://localhost:8080`.

## Features

- 18+ use confirmation and clear restrictions against real people or minor-coded characters.
- Drag-and-drop support for PNG, JPEG, WebP, and SVG files (maximum 15 MB).
- Browser-local three-stop palette mapping: shadows, midtones, and highlights.
- Four palettes, color wells, color coverage, vibrance, contrast, and warmth controls.
- Original / color / comparison view modes, zoom controls, and full-resolution PNG export.

> The app performs palette mapping, not generative AI colorization. It does not send images anywhere.
