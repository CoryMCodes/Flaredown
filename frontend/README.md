# Flaredown web app

The Ember.js client for Flaredown, served at app.flaredown.com. It talks to the Rails API in
`backend/`; there is no separate frontend server in development.

## Prerequisites

* [Git](http://git-scm.com/)
* Node 18 or newer. `.nvmrc` and `.tool-versions` pin the version CI builds against, so
  `nvm install` or `asdf install` will pick it up automatically.
* [Google Chrome](https://google.com/chrome/) or Chromium, to run the test suite.

You do not need a global `ember-cli` or `bower` install — both come from `npm install`, and the
local binaries live in `node_modules/.bin`.

## Installation

```bash
cd frontend
nvm install            # optional; any Node >= 18 works
cp env-example .env
npm install
```

`npm install` runs a `postinstall` script that applies our patches (`patch-package`) and installs
the remaining Bower packages. That works as an unprivileged user and as root, so no `sudo` and no
`--unsafe-perm` are needed.

Prefer `npm ci` when you want an install that exactly matches `package-lock.json`, such as in CI or
a fresh container.

## Running

```bash
npm run dev
```

* App: [http://localhost:4300](http://localhost:4300)
* Tests in the browser: [http://localhost:4300/tests](http://localhost:4300/tests)

API requests are proxied to `http://localhost:3000`, so run the backend as well if you need data.
From the repository root, `rake run` starts the backend and this app together.

## Configuration

`config/environment.js` reads `frontend/.env` (see `env-example` for the full list):

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the backend API is listening on. Defaults to 3000. |
| `FRONTEND_PORT` | Port this app is served from. Defaults to 4300. |
| `FACEBOOK_APP_ID` | Facebook login. Only required if you are working on that flow. |
| `PUSHER_KEY` | Realtime updates. |
| `RECAPTCHA_SITE_KEY` | Signup captcha. `env-example` ships with Google's public test key. |

## Testing and linting

```bash
npm test               # ember test, needs Chrome
npm run lint:js        # eslint
```

Set `CHROME_BIN` if Chrome is not on the default path, e.g. `CHROME_BIN=$(which chromium) npm test`.

## Building

```bash
npm run build          # production build into dist/
npm start              # serve a built dist/ (used on Heroku)
```

## Dependencies

Most dependencies are npm packages. Three remain in `bower.json` — `pace`, `pickadate` and `At.js`
— because the addons that consume them (`ember-cli-pickadate`, `ember-at-js`) import from
`bowerDirectory`. Moving those to npm means patching those addons, which has not been done yet.

Patches to third-party packages live in `patches/` and are applied by `patch-package` on install.
To add one, edit the package under `node_modules/`, then run `npx patch-package <package-name>`.

## Further reading

* [ember.js](https://emberjs.com/)
* [ember-cli](https://ember-cli.com/)
* [Ember Inspector for Chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
