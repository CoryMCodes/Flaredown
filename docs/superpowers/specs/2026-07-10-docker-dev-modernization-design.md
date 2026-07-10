# Docker Development Modernization Design

## Goal

New developers should be able to clone Flaredown and run the entire application in Docker on modern Mac hardware, including both Intel and Apple Silicon machines. The default Docker development path should support frontend hot reload from the host checkout.

## Current Behavior

The repository intends Docker development to run the Rails backend, Sidekiq workers, Ember frontend, PostgreSQL, MongoDB, and Redis with:

```sh
docker compose --profile dev up
```

The frontend is intended to run `ember serve` on port `4300` and proxy API requests to the backend container on port `3000`. Backend source is bind-mounted into the backend container, and frontend source is intended to be bind-mounted into the frontend container for live development.

The current frontend setup is brittle on modern Macs because it combines old tooling assumptions:

- `phantomjs-prebuilt` only supports x64 Linux binaries.
- The frontend Docker setup has used `linux/amd64`, which relies on emulation on Apple Silicon.
- `frontend/package.json` declares npm `6.x`, while some automation has installed npm 7.
- The frontend bind mount can hide image-installed `node_modules` and `bower_components` unless those paths are preserved with Docker volumes.

## Recommended Approach

Modernize the Docker development path without doing a broad Ember or Node migration.

1. Remove PhantomJS from the frontend toolchain.
2. Use Chrome or Chromium headless for frontend tests.
3. Stop forcing the frontend container to `linux/amd64`; let Docker use the native architecture for the host.
4. Keep the frontend source bind-mounted for hot reload.
5. Preserve container-installed frontend dependencies with named volumes for `/app/node_modules` and `/app/bower_components`.
6. Align Docker and CI with the npm version declared by the frontend package metadata.
7. Update documentation so first-time setup is clear and Docker-first.

This keeps the change focused on developer onboarding while replacing the obsolete browser dependency that blocks multi-architecture Docker.

## Docker Shape

The default `dev` profile should run:

- `backend`: Rails API on `localhost:3000`, with `./backend:/app`.
- `workers`: Sidekiq, with `./backend:/app`.
- `frontend`: Ember dev server on `localhost:4300`, with `./frontend:/app`.
- `postgres`, `mongodb`, and `redis`.

The frontend container should mount dependency directories separately:

```yaml
volumes:
  - ./frontend:/app
  - frontend_node_modules:/app/node_modules
  - frontend_bower_components:/app/bower_components
```

This allows host source edits to hot reload while keeping dependencies installed inside Docker.

## Frontend Test Browser

`frontend/testem.js` should use Chrome or Chromium instead of PhantomJS. CI should install or select the same browser so local Docker, local frontend tests, and GitHub Actions exercise the same path.

The test runner should not depend on host-installed browsers when run in Docker. If the frontend image installs Chromium, `testem.js` can use a Docker-friendly launcher configuration through environment variables.

## Documentation

The root README should present Docker as the default setup path:

```sh
cp backend/env-example backend/.env
cp backend/env-example frontend/.env
docker compose --profile dev up --build
```

It should state that the app is available at `http://localhost:4300`, the backend at `http://localhost:3000`, and frontend edits should hot reload.

The frontend README should stop listing PhantomJS as a prerequisite.

## Verification

The implementation should be verified with:

- `docker compose --profile dev build frontend`
- `docker compose --profile dev up`
- `docker compose --profile dev ps`
- Load `http://localhost:4300`
- Confirm backend access on `http://localhost:3000`
- Edit a frontend file and confirm Ember rebuilds or reloads
- Run the frontend test command with Chrome or Chromium, not PhantomJS

## Non-Goals

This work should not include a full Ember upgrade, a full Node upgrade, or removal of Bower unless a small Bower-related change is required to make Docker development work. Those migrations are valuable but should be separate issues or pull requests.
