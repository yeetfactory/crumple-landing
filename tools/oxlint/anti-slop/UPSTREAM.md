# Anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop (MIT, see `LICENSE`).
- Revision: `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13).
- Copied from `skills/install-anti-slop/assets/anti-slop/` at that revision,
  unmodified: `index.ts`, `rules/`, `shared/` and `vendor/eslint-stylistic/`.
- Registered in `.oxlintrc.json` as the `anti-slop` plugin.

## Local choices

- The opt-in Effect plugin (`effect/`) is not installed; this project does not
  use Effect.
- Upstream rule tests are not copied.
- All 18 generic rules and native `oxc/no-accumulating-spread` are errors.
- `oxlint` and `@oxlint/plugins` are pinned to the same exact version and must
  be upgraded together.
- The directory is excluded from formatting, linting, type checking and Knip so
  it stays identical to upstream. Keep `vendor/eslint-stylistic/LICENSE` and
  `vendor/eslint-stylistic/UPSTREAM.md` with it.
