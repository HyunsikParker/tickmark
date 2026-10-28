// Jira REST calls, all made as the current user so every result respects that user's permissions.
import api, { route, assumeTrustedRoute } from '@forge/api';

export const CONTROL = 'tickmark';
export const REQUEST = 'tickmark-request';
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };
const FIELDS = ['summary', 'assignee', 'attachment', 'status', 'duedate', 'created', 'project', 'issuetype'];
const MAX = 500;

async function call(path, options = {}) {
  const res = await api.asUser().requestJira(path, { headers: JSON_HEADERS, ...options });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// For the app's own paths built from issue keys it read from Jira; never pass free user input as `path`.
export const request = (method, path, body) => call(assumeTrustedRoute(path), { method, body: body ? JSON.stringify(body) : undefined });

async function search(jql, properties) {
  const issues = [];
  let nextPageToken;
  do {
    const body = { jql, fields: FIELDS, properties, maxResults: Math.min(100, MAX - issues.length) };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const page = await call(route`/rest/api/3/search/jql`, { method: 'POST', body: JSON.stringify(body) });
    issues.push(...(page.issues || []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && issues.length < MAX);
  return issues;
}

const person = (u) => (u ? { accountId: u.accountId, displayName: u.displayName } : null);
const files = (f) => (f.attachment || []).map((a) => ({ id: a.id, filename: a.filename, created: a.created, author: a.author?.displayName || null, size: a.size }));

export function toControl(issue) {
  const f = issue.fields || {};
  return { key: issue.key, summary: f.summary || '', owner: person(f.assignee), attachments: files(f), status: f.status?.name || '', project: f.project?.key, setup: issue.properties?.[CONTROL] || null };
}

export function toRequest(issue) {
  const f = issue.fields || {};
  const p = issue.properties?.[REQUEST] || {};
  return { key: issue.key, control: p.control, period: p.period, attachments: files(f), status: f.status?.name || '', statusCategory: f.status?.statusCategory?.key || 'new', created: f.created, duedate: f.duedate || null, owner: person(f.assignee) };
}

const quote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;

export async function controlsIn(projectKey) {
  const issues = await search(`project = ${quote(projectKey)} AND issue.property[${CONTROL}].frequency IS NOT EMPTY ORDER BY key ASC`, [CONTROL]);
  return issues.map(toControl).filter((c) => c.setup?.frequency);
}

export async function requestsFor(controlKeys) {
  if (!controlKeys.length) return [];
  const out = [];
  for (let i = 0; i < controlKeys.length; i += 50) {
    const keys = controlKeys.slice(i, i + 50).map(quote).join(', ');
    out.push(...(await search(`issue.property[${REQUEST}].control IN (${keys}) ORDER BY created ASC`, [REQUEST])).map(toRequest));
  }
  return out;
}

export async function getControl(key) {
  const issue = await call(route`/rest/api/3/issue/${key}?fields=${FIELDS.join(',')}&properties=${CONTROL}`);
  return toControl(issue);
}

export const setControl = (key, setup) => call(route`/rest/api/3/issue/${key}/properties/${CONTROL}`, { method: 'PUT', body: JSON.stringify(setup) });
export const siteUrl = async () => (await call(route`/rest/api/3/serverInfo`)).baseUrl;
export const myself = () => call(route`/rest/api/3/myself`);

// The base-level work type to create requests with: Task when the project has it, matched on the untranslated name.
export async function requestType(projectKey) {
  const meta = await call(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`);
  const types = (meta?.issueTypes || meta?.values || []).filter((t) => !t.subtask);
  return types.find((t) => /^task$/i.test(t.untranslatedName || t.name)) || types.find((t) => t.hierarchyLevel === 0) || types[0] || null;
}

const doc = (paragraphs) => ({ type: 'doc', version: 1, content: paragraphs.map((t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })) });

// One request work item per control and period, assigned to the control owner and due on the evidence due date.
export async function createRequest({ control, period, periodLabel, due, projectKey }) {
  const type = await requestType(projectKey);
  if (!type) throw new Error(`No work type in ${projectKey} can be created.`);
  const name = control.setup.controlId ? `${control.setup.controlId} ${control.summary.replace(new RegExp(`^${control.setup.controlId}\\s*[:-]?\\s*`), '')}` : control.summary;
  const fields = {
    project: { key: projectKey },
    issuetype: { id: type.id },
    summary: `Evidence for ${name}, ${periodLabel}`.slice(0, 250),
    description: doc([
      `Attach the evidence for ${periodLabel} to this work item by ${due}.`,
      control.setup.evidence ? `What is needed: ${control.setup.evidence}` : 'What is needed: see the control description.',
      `Control: ${control.key}. Created by Tickmark.`,
    ]),
    duedate: due,
  };
  if (control.owner?.accountId) fields.assignee = { accountId: control.owner.accountId };
  let created;
  try {
    created = await call(route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields }) });
  } catch (e) {
    // Some create screens refuse the due date or the assignee; create without them rather than fail.
    const { duedate, assignee, ...rest } = fields;
    created = await call(route`/rest/api/3/issue`, { method: 'POST', body: JSON.stringify({ fields: rest }) });
  }
  await call(route`/rest/api/3/issue/${created.key}/properties/${REQUEST}`, { method: 'PUT', body: JSON.stringify({ control: control.key, period }) });
  await call(route`/rest/api/3/issueLink`, { method: 'POST', body: JSON.stringify({ type: { name: 'Relates' }, inwardIssue: { key: created.key }, outwardIssue: { key: control.key } }) }).catch(() => null);
  return created.key;
}

// A small text file as an attachment (the sample loader's evidence files).
export async function attachText(key, filename, text) {
  const boundary = `tickmark${Date.now().toString(16)}`;
  const body = [`--${boundary}`, `Content-Disposition: form-data; name="file"; filename="${filename.replace(/"/g, '')}"`, 'Content-Type: text/csv', '', text, `--${boundary}--`, ''].join('\r\n');
  const res = await api.asUser().requestJira(route`/rest/api/3/issue/${key}/attachments`, {
    method: 'POST',
    headers: { 'X-Atlassian-Token': 'no-check', 'Content-Type': `multipart/form-data; boundary=${boundary}`, Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function transitionToDone(key) {
  const t = await call(route`/rest/api/3/issue/${key}/transitions`);
  const done = (t.transitions || []).find((x) => x.to?.statusCategory?.key === 'done');
  if (done) await call(route`/rest/api/3/issue/${key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: done.id } }) });
  return !!done;
}
