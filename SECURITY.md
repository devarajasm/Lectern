# Security policy

## Supported versions

Only the latest release receives security fixes while the project is in `0.x`.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub: **Security → Report a vulnerability** on this repository. Include:
- the affected version, and
- steps to reproduce.

You'll get an acknowledgement within a few days. Once a fix is released, we'll credit you unless you prefer otherwise.

## Deployment notes

Lectern is designed as a **single-user application on your own machine**. It has no authentication.

- Do not expose the backend (port 8000) to untrusted networks or the internet. If you must, put it behind an authenticating reverse proxy.
- API keys live in `.env`, which is git-ignored. Never commit it.
- Books, reading state and conversations are stored unencrypted in `data/`. Protect that directory like any other personal files.
