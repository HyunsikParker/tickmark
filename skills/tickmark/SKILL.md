---
name: tickmark
description: Reports which internal controls (SOX, ITGC and similar) kept as Jira work items are missing evidence for a period, what came in and when, and requests the missing evidence from the control owner, using the Tickmark tools on the Atlassian MCP server. Use when someone asks about control evidence, overdue evidence or evidence requests for a quarter or a control.
---

# Tickmark

Tickmark is a Forge app for Jira. Controls are Jira work items that run monthly, quarterly or yearly; the evidence for a
period is the files on the period's request work item, or files on the control whose names carry the period. This skill
tells an MCP client how to call its three tools and how to report what they return.

## Connect

1. A site admin installs Tickmark and turns on "Expose tools to MCP-compatible apps" for its Jira installation:
   Atlassian Administration > Apps > Sites > your site > Connected apps > Tickmark > app details. External MCP access is
   part of Atlassian's Early Access Program and is off by default.
2. Add `https://mcp.atlassian.com/forge/27d329a3-c516-419e-9edc-803373e761fe` as a remote MCP server in your client and
   sign in. On the consent screen you choose the site. The tools run with your own Jira permissions.

## Tools

- `evidence-status`, inputs `projectKey` and optional `quarter` (2026-Q3 or Q3 2026): every control in the project with
  the status of each of its periods that end in the quarter (`reviewed`, `in`, `late`, `requested`, `not-requested`,
  `overdue`, `upcoming`), the detail with due dates, the files and the request key, plus a one-line headline.
- `control-evidence`, input `issueKey`: one control's setup and its recent periods with the same detail.
- `request-evidence`, inputs `issueKey` and `period` (2026-09, 2026-Q3 or 2026): creates a work item that asks the
  control owner for that period's evidence, due on the evidence due date and linked to the control. It changes Jira, so
  call it only for a period the user named or confirmed. It skips periods that already have a request.

## Answering

Report overdue and late periods first, then the open ones: control ID, work item key, owner, period, due date and
request key. Then give how many periods have evidence. For one control, list each period with its state, the files with
their dates, and what is missing.

## Limits

- Report only what the tools return. Dates are in UTC.
- Tickmark records when evidence arrived and whether its request was closed. Do not judge whether a control works,
  whether the evidence is sufficient or what an auditor would conclude.
