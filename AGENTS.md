# Project conventions

- Keep the existing account and game state logic unchanged for presentation-only requests; authentication styling is not an authentication migration.
- Define casino and bingo visual roles as semantic CSS tokens, and use the shared Button component for newly styled controls.
- Keep generated sign-in artwork bundled as an ES module image import; render it as a background layer behind the unframed account form.