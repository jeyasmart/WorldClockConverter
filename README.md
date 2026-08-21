# Northstar Clocks

A lightweight, installable world-clock app that keeps your device time zone as the reference and converts any selected date/time to another city.

## Run now

Open `index.html` in a modern browser on Windows or Android.

## Install as an app

For the install button and offline caching, serve this folder from `localhost` or HTTPS. For example, with Python installed:

```text
python -m http.server 8080
```

Then open `http://localhost:8080` on Windows. On Android, open the same hosted URL in Chrome and choose **Add to Home screen**.

## Included

- Automatic device time-zone detection
- DST-aware reference-to-destination conversion
- Live saved clocks with UTC offsets
- Local storage for saved locations
- Add, edit, remove, and reorder saved cities
- Light/dark theme preference
- 12-hour and 24-hour display formats
- 12-hour display is the default format
- Responsive Windows and Android layout
- PWA manifest, icon, and service worker
