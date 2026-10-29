# Security policy

WebDNA loads untrusted web pages in a browser, so its network isolation is security-critical.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub's private vulnerability reporting:

**https://github.com/mahmutcirka/webdna/security/advisories/new**

(Repository → "Security" tab → "Report a vulnerability".) No e-mail address is published for security reports.

> Maintainer note: private vulnerability reporting must be enabled in the repository settings (Settings → Code security → Private vulnerability reporting) when the repository is created; until then the link above does not work.

Include reproduction steps, the affected version/commit, and impact. We aim to acknowledge reports within 7 days.

## In scope

- Reaching private, loopback, link-local, metadata or otherwise internal addresses (directly, via redirects, DNS rebinding, IPv6 forms, alternative IP notations, proxies or browser features).
- Reading local files or server secrets through a scan.
- Executing downloaded code outside the isolated browser.
- Bypassing scan resource limits in a way that exhausts the host.
- Secret leakage into reports or exports.
- Path traversal or injection in the API.

## Out of scope

- Findings that require running WebDNA with `WEBDNA_UNSAFE_ALLOW_LOOPBACK` or on a non-loopback host without authentication (both documented as unsafe).
- Chromium zero-days — report those to the Chromium project. WebDNA does not claim protection against browser sandbox escapes.

## Hardening built in

- Per-scan forward proxy: DNS resolved once, all addresses validated, connection pinned to the validated IP; loopback is proxied too (`<-loopback>`).
- Blocks private, loopback, link-local, CGNAT, unique-local, multicast, reserved, documentation, benchmarking, 6to4/Teredo/NAT64 ranges and IPv4-mapped forms; local hostnames (`localhost`, `*.local`, `*.internal`, …) are rejected.
- Chromium's internal resolver maps every name except the proxy address to NOTFOUND, so no page-controlled DNS lookup leaves the browser (net-log verified).
- QUIC and non-proxied WebRTC disabled; service workers, downloads and permissions blocked; non-http(s) schemes aborted.
- Byte, connection, request, redirect, time and captured-source limits; bounded queue and concurrency.
- Page measurements run in a separate CDP isolated world, so page scripts cannot override built-ins to forge measurements or stall the scan; every in-page call has a Node-side timeout.
- Static analysis parses files as data only, with linear-time comment scanning. Snippets are truncated and secret-like values redacted.
- The API binds to `127.0.0.1` by default and has no authentication: put it behind an authenticating reverse proxy before exposing it.

## Recommended deployment

Run WebDNA in a dedicated VM or container without access to internal networks or cloud credentials, as an unprivileged user, with egress firewall rules that mirror the policy above (defence in depth).
