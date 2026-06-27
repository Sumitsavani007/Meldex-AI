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

- Live deployed HTML/workbench source search pending at report creation time.
