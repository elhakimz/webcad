# Font Credits — assets/fonts/

Documents every font served to browsers from `public/fonts/`, its license, and the attribution/redistribution requirements WebCad must meet. Created per dependency triage spec Q2 (resolved: yes, author FONT-CREDITS.md when Arimo fonts are added).

## Fonts served from `public/fonts/`

| File | License | Copyright holder | Attribution required | Redistribution allowed |
|------|---------|-----------------|---------------------|----------------------|
| `osifont.ttf` | SIL OFL 1.1 | OSIFont project (unverified — check upstream) | Yes: retain OFL.txt + copyright notice | Yes, under OFL terms |
| `helvetiker_regular.typeface.json` | MIT (unverified — check Three.js source) | Three.js contributors (unverified) | Yes: retain copyright + license notice | Yes, under MIT terms |

### License notes

- **SIL OFL 1.1**: Font can be embedded, redistributed, and modified. Must include OFL.txt and copyright notice. Reserved font names may not be used for modified versions. Web use (serving to browsers) is explicitly permitted.
- **MIT**: Permissive — must include copyright and license notice in distribution. Web use permitted.

## Materializr fonts — NOT bundled

Per Q3 (resolved: no), WebCad does **not** bundle fonts from elhakimz/materializr. Materializr's FONT-CREDITS.md lists 10 fonts under SIL OFL, Bitstream Vera/Arev, Ubuntu Font License, and MIT (Iconoir). Those are upstream libraries used directly under their own licenses, not copied into WebCad.

## Planned fonts

- **Arimo** (Apache 2.0) — planned but not yet added. When added, update this file with Arimo's license, copyright, and attribution text.

## Attribution/redistribution requirements for WebCad

If fonts are served to browsers (as they are now via `public/fonts/`):

1. Include a copy of each font's license file (OFL.txt, LICENSE, etc.) in the repo alongside this document.
2. Retain copyright notices in the served font files or in this credits document.
3. For OFL fonts: do not use reserved font names for derivative/modified versions.
4. For MIT fonts: include the MIT license text in distribution.
5. No additional attribution is required for web serving under OFL or MIT, but this document serves as the public attribution record.

## Unverified

- `osifont.ttf` exact copyright holder and license text — not confirmed in repo. Verify against upstream OSIFont project.
- `helvetiker_regular.typeface.json` exact license — not confirmed in repo. Verify against Three.js source.
- Arimo font license text — not yet added to repo; will verify when added.
