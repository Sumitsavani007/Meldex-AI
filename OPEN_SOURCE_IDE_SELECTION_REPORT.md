# Open Source IDE Selection Report

Date: 2026-06-27

## Selected Base

Selected: OpenVSCode Server

Reason:

- It is the closest upstream-compatible VS Code-in-browser base.
- It supports native file explorer, editor tabs, search, terminal, extensions, webviews, and themes.
- It supports connection tokens for access control.
- It can be deployed with the official Docker image or release binary.

## License

- Repository checked: `gitpod-io/openvscode-server`
- License file: `LICENSE.txt`
- License: MIT
- Notices must be preserved if vendoring or redistributing any OpenVSCode assets.

## Local Install Status

Repository was cloned to `/tmp/meldex-ide-research/openvscode-server`.

Docker is installed, but the Docker daemon was not running locally:

`Cannot connect to the Docker daemon at unix:///Users/sumitsavani/.docker/run/docker.sock`

Therefore the browser IDE base could not be started locally in this run.

## Decision

Proceed with OpenVSCode Server, but deployment is blocked until the OpenVSCode runtime is installed/running on AWS with a secure per-workspace tokenized route.

