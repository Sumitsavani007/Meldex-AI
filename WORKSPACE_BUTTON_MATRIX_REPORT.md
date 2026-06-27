# Workspace Button Matrix Report

Date: 2026-06-27

## Explorer

| Control | Status | Notes |
| --- | --- | --- |
| File row | Working | Opens selected workspace file. |
| Folder row | Working | Expands/collapses folder. |
| New File | Working | Creates file through workspace file API. |
| New Folder | Working | Creates folder marker through workspace file API; hidden if empty. |
| Rename | Working for files | Disabled for folders with reason. |
| Delete | Working for files | Disabled for folders with reason. |
| Copy Path | Working | Copies real workspace path. |
| Search files | Working | Filters real tree. |

## Preview

| Control | Status | Notes |
| --- | --- | --- |
| Refresh | Working | Calls preview verification endpoint. |
| Back | Disabled with reason | Preview history is not implemented in V2. |
| Forward | Disabled with reason | Preview history is not implemented in V2. |
| URL field | Working display | Shows current preview URL. |
| Device selector | Working | Changes viewport width. |
| Responsive selector | Working | Changes preview width mode. |
| Zoom selector | Working | Scales preview frame. |
| Open in new tab | Working when preview exists | Disabled when no preview exists. |
| Copy preview URL | Working when preview exists | Disabled when no preview exists. |

## Right Panel

| Control | Status | Notes |
| --- | --- | --- |
| CHAT tab | Working | Shows prompt, checklist, controls, files, activity. |
| RULES tab | Working | Shows memory-backed coding/design rules. |
| FILES tab | Working | Opens generated files and copies paths. |
| ACTIVITY tab | Working | Shows chronological runtime events. |
| MEMORY tab | Working | Searches and clears workspace memory. |
| Stop | Working while task streams | Disabled when idle. |
| Retry | Working when prior task exists | Disabled otherwise. |
| Continue | Working | Sends continuation prompt. |
| Send | Working | Runs or stops active task. |
| Attach context | Disabled with reason | Not available in this release. |
| Voice | Disabled with reason | Not available in this release. |
| History | Disabled with reason | Not available in this release. |
| Settings | Disabled with reason | Managed automatically in this release. |
| More | Disabled with reason | Not available in this release. |

