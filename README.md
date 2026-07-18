# Jellyfin Full-Bleed Media Bar Hero

A Netflix-style, **truly full-screen** home page hero for Jellyfin: the featured movie's backdrop and auto-playing trailer fill the entire viewport, edge to edge — no black bottom border, no fade-out band — and the library rows start flush beneath it on desktop **and** mobile.

Built on top of:

| Piece | Project |
|---|---|
| Theme | [Abyss](https://github.com/AumGupta/abyss-jellyfin) by AumGupta |
| Hero / trailer slideshow | [Media Bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar) plugin (slideshow by M0RPH3US) |
| Plugin injection | [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation) plugin |

Everything in this repo is pure **Custom CSS** — no web files are modified, so it survives Jellyfin updates and applies to every client that renders the server's web UI.

## What the CSS fixes

Out of the box, the Abyss + Media Bar combo has three quirks this stylesheet corrects:

1. **Bottom black border on the hero.** The Media Bar sizes its slideshow to 90% of the viewport and applies a CSS mask that fades the bottom of the backdrop/trailer to transparent, revealing the black page behind it. This CSS makes the slideshow exactly `100dvh` tall and removes the bottom fade masks — the trailer video is sized to *cover* the viewport, so it reaches every edge. The horizontal blend between the backdrop art (left) and the trailer (right) is preserved.

2. **Dead space before the library rows.** The Media Bar pushes the home sections down with `top: 65vh` *on top of* a spacer element, stacking up to ~35% of a viewport of pure black between the hero and "My Media". The spacer (`.featurediframe`, a leftover Abyss Spotlight iframe that sits invisibly *behind* the Media Bar hero) is hidden entirely, and the rows get a plain `margin-top: 100dvh` instead — one exact viewport of space.

3. **Desktop/mobile inconsistency.** The spacer iframe only exists on clients that receive the patched desktop web bundle, so any layout that depends on it breaks on phones (rows overlapping the hero at the top of the page). The margin approach in this CSS behaves identically everywhere. A few extra rules also tidy up the Media Bar's action buttons and metadata row on narrow screens.

## Install

1. Install the **Media Bar** plugin (and its **File Transformation** dependency) from the Jellyfin plugin catalog, then restart Jellyfin.
2. Open **Dashboard → General → Branding → Custom CSS**.
3. Paste the entire contents of [`custom.css`](custom.css) and save.
4. Refresh your clients (hard-refresh the browser / clear the app cache if the old style lingers).

The Abyss theme itself is pulled in by the `@import` at the top of the file — you don't need to install it separately. If you already have your own Custom CSS, keep your rules and append everything below the *Media Bar: full-viewport edge-to-edge hero* comment block.

## Notes & tweaks

- `100dvh` (with a `100vh` fallback) is used so mobile browsers with collapsing URL bars size the hero to the *visible* viewport.
- Removing the bottom fade means the hero ends in a clean hard cut when you scroll instead of a gradual fade. If you prefer more contrast for the plot text over bright trailers, add a scrim, e.g.:

  ```css
  .gradient-overlay {
    background: linear-gradient(130deg, rgba(29,29,29,.65) 10%, rgba(29,29,29,.35) 30%, rgba(29,29,29,0) 100%),
                linear-gradient(to top, rgba(0,0,0,.55), transparent 30%) !important;
  }
  ```

- Tested on Jellyfin 10.x (Windows server) with Media Bar 2.4.12 and Abyss (2026), on desktop Chrome and Android (Samsung S24 Ultra).

## Credits

All the heavy lifting is done by the [Abyss theme](https://github.com/AumGupta/abyss-jellyfin) and the [Media Bar plugin](https://github.com/IAmParadox27/jellyfin-plugin-media-bar) — this repo just makes them full-bleed and consistent across devices. Go star those projects.
