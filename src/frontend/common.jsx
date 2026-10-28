import React from 'react';
import { Inline, Link, Lozenge, Stack, Text } from '@forge/react';

const STATE = {
  reviewed: ['success', 'Reviewed'],
  in: ['success', 'Evidence in'],
  late: ['moved', 'Came in late'],
  requested: ['inprogress', 'Requested'],
  'not-requested': ['default', 'Not requested'],
  overdue: ['removed', 'Overdue'],
  upcoming: ['default', 'Period running'],
  'not-due': ['default', 'Not due this quarter'],
};

export function StateLozenge({ state }) {
  const [appearance, label] = STATE[state] || ['default', state];
  return <Inline><Lozenge appearance={appearance}>{label}</Lozenge></Inline>;
}

export const issueUrl = (site, key) => `${site}/browse/${key}`;
export const day = (ms) => new Date(ms).toISOString().slice(0, 10);

// One period: what came in (file, date, who) or what is missing, and the request work item.
export function PeriodLine({ p, site, showLabel = true }) {
  return (
    <Stack space="space.025">
      <Text>{showLabel ? `${p.label}: ${p.text}` : p.text}</Text>
      {p.evidence.map((e) => (
        <Text key={`${e.key}-${e.id}`} size="small">{`${e.file}, ${day(e.at)}${e.by ? `, ${e.by}` : ''} `}<Link href={issueUrl(site, e.key)} openNewTab>{e.key}</Link></Text>
      ))}
      {p.request && !p.evidence.some((e) => e.key === p.request.key) && <Text size="small">Request: <Link href={issueUrl(site, p.request.key)} openNewTab>{p.request.key}</Link>{` (${p.request.status})`}</Text>}
    </Stack>
  );
}
