# Security

Twinfold processes user-selected files locally and never intentionally uploads them. The built page has no external resources and blocks network connections through its Content Security Policy. These measures do not defend against a malicious hosting provider that changes the HTML, browser extensions, or a compromised device.

Snapshots are untrusted JSON and are validated before use. They are unsigned records and do not prove authenticity. Reports and snapshots expose relative file names and hashes. File contents with very small possible value spaces may be inferable from hashes.

If a public GitHub repository has private vulnerability reporting enabled, use its Security tab to report vulnerabilities privately. Otherwise, open an issue with only a high-level description asking for a private contact channel; do not publish credentials, personal files, or sensitive exploit details.

The first release has automated core tests and local browser checks, but has not received an independent security audit.
