# Project memory

## Product intent & audience

- Marketing/landing page for a product positioned around "calm interfaces that feel alive"; audience is developers/designers building UI.
- Hero-first page: badge, headline, supporting copy, primary + secondary CTAs, followed by content sections.

## Brand personality & voice

- Calm, alive, subtle. Favors "living", "flows on its own", "leans towards the pointer", "rests when no one is looking" phrasing.
- Motion is ambient and gentle, not flashy — but must be clearly visible across the full page per user request.

## Visual design & UX direction

- Stack: Vite + React + Tailwind v4. No shadcn; no `@` path alias (use relative paths).
- Theme: light base with a teal accent.
- `ShaderArt`: WebGL animated field behind children; `contain: paint` holds canvas. Pointer-reactive (leans toward cursor), auto-pauses when offscreen/hidden/reduced-motion. CSS radial-gradient fallback when WebGL unavailable (`data-renderer="css"` vs `"webgl"`).
- Integration: wrap root container. Shader is now visible across the **entire page**, not just the hero. All content sections are transparent; content cards use semi-transparent backgrounds with `backdrop-blur` so shader shows through while text remains readable.
- Previously sections used solid `bg-[#f8fafc]` / `bg-[#faf8ff]` panels — those were removed per user request for full-page shader visibility.
- Hero overlay: soft blurred `bg-background/70` pool under text for readability; badge pill, balanced headline, pretty copy, rounded-full CTA buttons.
- Prefer explicit colors passed to `ShaderArt` rather than relying on undefined CSS variables.
- Shader intensity and speed were bumped up to make the effect clearly visible across the full page.

## Decisions, constraints & rationale

- Pass explicit teal-themed colors to `ShaderArt` to avoid dependence on `--background`/`--primary` variables that may not exist in this Vite setup.
- User explicitly wanted the shader background visible on the full page, not just one section. Solid section backgrounds removed; cards made semi-transparent with blur to preserve readability.
- WebGL context: `antialias: false`, `depth: false`; handles context loss/rebuild; respects `prefers-reduced-motion`.
- Build verified passing after changes; dependencies installed.

## Open questions & assumptions

- Whether semi-transparent blurred cards provide sufficient text readability over an animated shader at all viewport sizes.
- Expected responsive breakpoints/behavior for shader scale/intensity across devices not yet specified.
- No `.bolt/prompt` present; assumptions inferred from code + integration conversation.