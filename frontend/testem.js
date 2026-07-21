/*jshint node:true*/
const chromePath = process.env.CHROME_BIN || 'google-chrome';

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
  "browser_paths": {
    "Chrome": chromePath
  },
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
