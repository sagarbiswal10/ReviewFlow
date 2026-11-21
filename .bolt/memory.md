# Project memory

## Product intent & audience

- Marketing/landing page for a product positioned around "calm interfaces that feel alive"; audience is developers/designers building UI.
- Hero-first page: badge, headline, supporting copy, primary + secondary CTAs, followed by content sections.

## Brand personality & voice

- Calm, alive, subtle. Favors "living", "flows on its own", "leans towards the pointer", "rests when no one is looking" phrasing.
- Motion is ambient and gentle, not flashy.

## Visual design & UX direction

- Stack: Vite + React + Tailwind v4. No shadcn; no `@` path alias (use relative paths).
- Theme: light base with a teal accent. Content section panels use solid `bg-[#f8fafc]` / `bg-[#faf8ff]`.
- `ShaderArt`: WebGL animated field behind children; `contain: paint` holds canvas. Pointer-reactive (leans toward cursor), auto-pauses when offscreen/hidden/reduced-motion. CSS radial-gradient fallback when WebGL unavailable (`data-renderer="css"` vs `"webgl"`).
- Integration: wrap root container; hero background transparent so shader shows through; subsequent sections keep solid panels so shader gives way to content.
- Hero overlay: soft blurred `bg-background/70` pool under text for readability; badge pill, balanced headline, pretty copy, rounded-full CTA buttons.
- Prefer explicit colors passed to `ShaderArt` rather than relying on undefined CSS variables.

## Decisions, constraints & rationale

- Pass explicit teal-themed colors to `ShaderArt` to avoid dependence on `--background`/`--primary` variables that may not exist in this Vite setup.
- Keep existing landing content unchanged; only add wrapper + transparent hero bg.
- WebGL context: `antialias: false`, `depth: false`; handles context loss/rebuild; respects `prefers-reduced-motion`.
- Build verified passing after integration; dependencies installed.

## Open questions & assumptions

- Whether the shader should appear beyond the landing hero (other routes/sections) or stay landing-only.
- Expected responsive breakpoints/behavior for shader scale/intensity across devices not yet specified.
- No `.bolt/prompt` present; assumptions above inferred from code + integration conversation.