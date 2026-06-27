# Meldex IDE OpenVSCode Removal Report

Date: 2026-06-27

## Scope

Remove visible upstream branding from the production Meldex IDE experience.

## Implementation

- Product metadata is patched before `openvscode-server` starts.
- Containers are versioned with Docker label `com.meldex.ide.version=native-v3`.
- Old unlabeled containers are removed and recreated on the next authenticated session start.
- Window title defaults to `Meldex IDE`.

## Not Changed

- MIT-licensed upstream runtime remains the implementation base.
- Meldex auth and workspace ownership checks remain unchanged.
- Proxy route remains protected behind Meldex session validation.
