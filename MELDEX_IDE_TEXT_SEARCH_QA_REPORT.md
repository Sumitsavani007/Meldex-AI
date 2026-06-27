# Meldex IDE Text Search QA Report

Date: 2026-06-27

## What Was Broken

- Forbidden upstream text could still exist in user-facing workbench sources.

## What Changed

- Runtime source patch now replaces upstream product, welcome, setup, and chat strings in workbench localization files.

## Local Search

Command:

`rg -n "OpenVSCode|OpenVSCode Server|Visual Studio Code|Code OSS|Editing evolved|Setup VS Code|Get Started with VS Code|Ask @vscode|Create Project" app components lib scripts --glob '!**/*.map'`

Result:

- Matches remain only in internal replacement code/function names used to remove upstream text.
- No matches were found in user-facing React copy.

## Remaining Issues

- Live authenticated IDE shell route source search found no forbidden strings.
- Live container workbench source search found no forbidden strings in patched product/localization files.
- Forbidden strings still exist in internal replacement code and historical reports/attachments; those are not user-facing rendered UI.
