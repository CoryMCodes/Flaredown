# Docker Development Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Docker development run the full Flaredown app with frontend hot reload on both Intel and Apple Silicon Macs.

**Architecture:** Keep the existing Rails, Sidekiq, Ember, PostgreSQL, MongoDB, and Redis Compose topology. Replace the obsolete PhantomJS frontend test dependency with Chrome/Chromium, make the frontend image host-architecture-native, and preserve container-installed frontend dependencies with named volumes while bind-mounting source for hot reload.

**Tech Stack:** Docker Compose, Rails, Sidekiq, Ember CLI 2.18, Testem, Chrome/Chromium headless, Node 14, npm 6, Bower.

---

## File Map

- `frontend/package.json`: remove `phantomjs-prebuilt`, make Bower postinstall work as root inside Docker.
- `frontend/package-lock.json`: regenerate after package changes with npm 6.
- `frontend/testem.js`: replace PhantomJS launchers with Chrome headless launchers.
- `.github/workflows/frontend.yml`: align CI npm version and Chrome test environment with the frontend package metadata.
- `frontend/Dockerfile`: build a multi-architecture frontend image with Chromium, npm 6, app dependencies, and Bower assets.
- `docker-compose.yml`: bind-mount frontend source while preserving `/app/node_modules` and `/app/bower_components` through named volumes; remove hard-coded amd64.
- `README.md`: document Docker as one supported run method while leaving unrelated native instructions intact.
- `frontend/README.md`: remove PhantomJS from prerequisites.

---

### Task 1: Replace PhantomJS With Chrome Headless

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/testem.js`
- Modify: `.github/workflows/frontend.yml`

- [ ] **Step 1: Update `frontend/package.json`**

Remove the PhantomJS dependency and make Bower root-safe for Docker:

```json
"postinstall": "patch-package && ./node_modules/bower/bin/bower --allow-root install",
```

Delete this dev dependency:

```json
"phantomjs-prebuilt": "^2.1.16",
```

- [ ] **Step 2: Regenerate the frontend lockfile with npm 6**

Run:

```bash
docker run --rm -v /Users/corymusick/code/Flaredown/frontend:/app -w /app node:14.21 sh -lc "npm i -g npm@6 && npm install --package-lock-only --ignore-scripts"
```

Expected:

```text
+ npm@6.14.18
updated 1 package
```

and `frontend/package-lock.json` no longer contains a top-level `phantomjs-prebuilt` package entry.

- [ ] **Step 3: Update `frontend/testem.js`**

Replace the file with:

```js
/*jshint node:true*/
module.exports = {
  "framework": "qunit",
  "test_page": "tests/index.html?hidepassed",
  "disable_watching": true,
  "launch_in_ci": [
    "Chrome"
  ],
  "launch_in_dev": [
    "Chrome"
  ],
  "browser_args": {
    "Chrome": [
      "--headless",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--remote-debugging-port=0"
    ]
  },
  "proxies": {
    "/api": {
      "target": "http://localhost:3000"
    }
  }
};
```

- [ ] **Step 4: Update frontend CI npm version**

In `.github/workflows/frontend.yml`, replace both:

```yaml
- run: npm install -g npm@7.0.0
```

with:

```yaml
- run: npm install -g npm@6.14.18
```

- [ ] **Step 5: Set CI Chrome environment**

Add `CHROME_BIN` to both frontend test jobs:

```yaml
    env:
      CHROME_BIN: google-chrome
```

Expected shape:

```yaml
  test-app:
    name: Test app
    needs: changes
    if: ${{ needs.changes.outputs.frontend == 'true' }}
    runs-on: ubuntu-latest
    timeout-minutes: 7
    env:
      CHROME_BIN: google-chrome
```

Repeat the same `env` block for `node-next-test`.

- [ ] **Step 6: Verify PhantomJS is gone from source references**

Run:

```bash
rg -n "phantom|Phantom|phantomjs" frontend .github
```

Expected: no output.

- [ ] **Step 7: Commit test/browser modernization**

Run:

```bash
git add frontend/package.json frontend/package-lock.json frontend/testem.js .github/workflows/frontend.yml
git commit -m "Replace PhantomJS with Chrome for frontend tests"
```

---

### Task 2: Make Frontend Docker Native-Architecture With Hot Reload

**Files:**
- Modify: `frontend/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Update `frontend/Dockerfile`**

Replace the file with:

```Dockerfile
FROM node:14.21

WORKDIR /app

RUN apt-get update -qq && \
      apt-get install -y --no-install-recommends chromium && \
      rm -rf /var/lib/apt/lists/*

RUN npm i -g npm@6.14.18

ENV CHROME_BIN=/usr/bin/chromium
ENV OPENSSL_CONF=/dev/null

COPY package*.json bower.json .bowerrc .npmrc ./

RUN npm install --unsafe-perm

COPY . .

CMD ["npm", "start"]
```

- [ ] **Step 2: Update `docker-compose.yml` frontend service**

Ensure the frontend service has no `platform: linux/amd64` entry and includes source and dependency volumes:

```yaml
  frontend:
    build: frontend
    depends_on:
      - backend
    ports:
      - 4300:4300
      - 65535:65535
    volumes:
      - ./frontend:/app
      - frontend_node_modules:/app/node_modules
      - frontend_bower_components:/app/bower_components
    environment:
      CHROME_BIN: /usr/bin/chromium
    command: sh -c "cd /app && rm -rfd ./dist && ./node_modules/.bin/ember serve --watcher polling --port 4300 --proxy http://backend:3000 --live-reload-host 0.0.0.0 --live-reload-port 65535"
    profiles:
      - dev
```

Add the frontend volumes at the bottom:

```yaml
volumes:
  postgres:
  mongodb:
  redis:
  notused:
  frontend_node_modules:
  frontend_bower_components:
```

- [ ] **Step 3: Validate Compose syntax**

Run:

```bash
docker compose --profile dev config --services
```

Expected includes:

```text
mongodb
postgres
redis
backend
frontend
workers
```

- [ ] **Step 4: Build the frontend image**

Run:

```bash
docker compose --profile dev build frontend
```

Expected: build succeeds for the host architecture and does not install PhantomJS.

- [ ] **Step 5: Commit Docker hot reload changes**

Run:

```bash
git add frontend/Dockerfile docker-compose.yml
git commit -m "Support native Docker frontend hot reload"
```

---

### Task 3: Update Documentation With Minimal Scope

**Files:**
- Modify: `README.md`
- Modify: `frontend/README.md`

- [ ] **Step 1: Update the root README Docker wording only**

In `README.md`, replace the first paragraph under `## Installation` with:

```markdown
You can run the application and its dependencies using `docker compose`, or run the app natively using the setup instructions below.
Alternatively, you can run the app using the `make` commands available: `make help`

If you want to run the application on your own machine see the next sections on dependency installations.
```

Leave the rest of the README unchanged unless a later verification step proves a line is now incorrect.

- [ ] **Step 2: Preserve native Mac prerequisites for now**

Do not remove the current M1 native shell workaround unless implementation verification proves the native setup no longer needs it. This Docker-focused change does not prove that, so leave the section intact:

```markdown
#### Mac Prerequisites
```

- [ ] **Step 3: Remove PhantomJS from frontend README prerequisites**

In `frontend/README.md`, delete:

```markdown
* [PhantomJS](http://phantomjs.org/)
```

Leave the Chrome prerequisite.

- [ ] **Step 4: Commit documentation changes**

Run:

```bash
git add README.md frontend/README.md
git commit -m "Document Docker as supported development setup"
```

---

### Task 4: End-to-End Docker Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Start the Docker stack**

Run:

```bash
docker compose --profile dev up --build
```

Expected:

```text
frontend-1  | Build successful
frontend-1  | Serving on http://localhost:4300/
backend-1   | Puma starting
```

- [ ] **Step 2: Verify service status**

In a second terminal, run:

```bash
docker compose --profile dev ps
```

Expected: `backend`, `frontend`, `workers`, `postgres`, `mongodb`, and `redis` are running.

- [ ] **Step 3: Verify frontend HTTP response**

Run:

```bash
curl -I http://localhost:4300
```

Expected:

```text
HTTP/1.1 200 OK
```

- [ ] **Step 4: Verify backend HTTP response**

Run:

```bash
curl -I http://localhost:3000
```

Expected: an HTTP response from Rails. A redirect or application-level non-200 is acceptable; connection refused is not.

- [ ] **Step 5: Verify hot reload behavior**

Temporarily edit a harmless frontend template text or comment, then watch the frontend container logs:

```bash
docker compose --profile dev logs -f frontend
```

Expected: Ember detects a rebuild after the host file changes.

Revert the temporary frontend content edit before committing anything else.

- [ ] **Step 6: Verify frontend tests use Chrome**

Run:

```bash
docker compose --profile dev run --rm frontend npm test
```

Expected: Testem launches Chrome and does not mention PhantomJS.

- [ ] **Step 7: Record verification notes**

If all verification passes with no source edits, do not create a commit. If verification requires a small fix, make that fix and commit it with:

```bash
git add <changed-files>
git commit -m "Fix Docker development verification issue"
```

---

### Task 5: Final Review

**Files:**
- No source edits expected unless review reveals a small issue.

- [ ] **Step 1: Review final diff**

Run:

```bash
git status --short
git log --oneline --decorate -5
git diff origin/master...HEAD --stat
```

Expected: work is split into the design commits plus the implementation commits above.

- [ ] **Step 2: Confirm no unrelated README churn**

Run:

```bash
git diff origin/master...HEAD -- README.md frontend/README.md
```

Expected: README changes are limited to Docker wording and PhantomJS prerequisite removal.

- [ ] **Step 3: Prepare PR summary**

Use this summary:

```markdown
## Summary

- replace PhantomJS with Chrome/Chromium for frontend tests
- make frontend Docker build native-architecture friendly
- preserve Docker hot reload with frontend dependency volumes
- document Docker as a supported development setup without making it the default

## Verification

- docker compose --profile dev build frontend
- docker compose --profile dev up --build
- curl -I http://localhost:4300
- docker compose --profile dev run --rm frontend npm test
```
