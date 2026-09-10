# Repository Guidelines

## Generated Image Delivery

用户明确要求：以后为本项目生成的所有图片（包括设计展示、预览和正式素材）都必须保存一份到 `/home/kathy/知乎漂流瓶/`，不要只留在工具的默认生成目录，也不要再次询问保存位置。使用清晰的文件名，已有同名文件时递增版本号，避免覆盖。交付时提供本地文件链接。

## Project Structure & Module Organization

This workspace is an initial scaffold: no application source, tests, assets, or dependency manifests are present. The `.agents/`, `.codex/`, and `.git/` directories are empty metadata placeholders; do not use them for application files.

When adding the first implementation, organize source under `src/`, automated tests under `tests/`, and static resources under `assets/`, unless the chosen framework requires another layout. Document the actual structure and application entry point in `README.md`.

## Build, Test, and Development Commands

The Three.js implementation lives in `frontend/`. From that directory, use `corepack pnpm install` to install dependencies, `corepack pnpm dev` to run locally, `corepack pnpm build` to build, `corepack pnpm test` for data behavior tests, and `corepack pnpm test:e2e` for desktop/mobile browser flows. Details and environment requirements are in `frontend/README.md`.

When introducing a toolchain, provide reproducible commands for installing dependencies, running locally, building, and testing. Record them in `README.md` and update this guide. Commit the appropriate dependency lockfile.

## Coding Style & Naming Conventions

No language or formatter has been selected. Follow the chosen language's standard conventions and add a shared formatter or linter configuration with the first implementation. Keep indentation consistent within each file and avoid unrelated formatting changes.

Use descriptive names for files, modules, and functions. Group related functionality together and keep configuration separate from application logic.

## Testing Guidelines

No testing framework or coverage threshold exists. Add an appropriate test runner when introducing executable code, and document how to run the full suite and individual tests. Use the framework's discovery conventions and descriptive test names that identify behavior. Cover new behavior and include regression tests for bug fixes.

## Commit & Pull Request Guidelines

Git history is unavailable, so no existing commit convention can be inferred. Use concise, imperative subjects, such as `Add initial application scaffold`, and keep commits focused.

Pull requests should explain the change, link relevant issues, and report verification commands and results. Include screenshots for visible interface changes. Explicitly note checks that could not be run.

## Security & Configuration

Never commit credentials, tokens, or local secrets. Provide placeholder values in configuration examples and document required environment variables when adding external services.
