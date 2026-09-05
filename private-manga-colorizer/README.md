# Manga Tone — Private Colorizer

A small **browser-only** colorizer for black-and-white, fictional adult manga pages you are entitled to use privately.

## Privacy model

- No server, upload endpoint, third-party script, account, analytics, or storage integration.
- Files only live in the current browser memory. Refreshing or closing the app clears the set.
- The app accepts PNG, JPEG, WebP, and SVG (15 MB each), handles up to 30 pages in a session, and exports the active color pass as a PNG.

## Use

Open `index.html` in a modern desktop browser, or serve the folder locally:

```bash
python3 -m http.server 8080 --directory private-manga-colorizer
```

This is a palette-mapping color tool, not a generative AI service. It keeps the page's dark line-work and remaps its grayscale tones to a three-color palette.
