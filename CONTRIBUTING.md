# Contributing

Small, practical contributions are welcome: browser compatibility fixes, localization, accessibility, performance measurements, and reproducible comparison bugs.

Use Node.js 20.19+ and run `npm ci`, `npm test`, and `npm run build`. For interface changes, open the built HTML and check both English and Chinese at desktop and narrow widths. Include a before/after screenshot when it helps.

Keep the app read-only, usable offline, and free of analytics or external runtime resources. Do not silently skip files or treat failed reads as successful verification. Do not infer a move when identical-content candidates are ambiguous.

For bugs, provide browser and OS versions, the smallest synthetic folder layout that reproduces the issue, expected status, and actual status. Never attach personal backups, credentials, or confidential snapshot paths.

New comparison rules should include a focused regression test. Please discuss major feature additions before implementing them; synchronization and destructive file operations are outside the current scope.
