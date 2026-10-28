import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, DynamicTable, Heading, Inline, Link, Lozenge, SectionMessage, Select, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import { StateLozenge, PeriodLine, issueUrl } from './common.jsx';

const FREQ = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Yearly' };

function Overview({ data }) {
  return (
    <DynamicTable
      head={{ cells: [{ key: 'c', content: 'Control' }, { key: 'o', content: 'Owner' }, { key: 's', content: 'Status' }, { key: 'p', content: 'Evidence by period' }] }}
      rows={data.rows.map((r) => ({
        key: r.key,
        cells: [
          { key: 'c', content: <Stack space="space.050"><Link href={issueUrl(data.site, r.key)} openNewTab>{r.summary}</Link><Inline space="space.050"><Text size="small">{FREQ[r.frequency]}</Text>{r.keyControl && <Lozenge>Key control</Lozenge>}</Inline></Stack> },
          { key: 'o', content: <Text>{r.owner?.displayName || 'Unassigned'}</Text> },
          { key: 's', content: <StateLozenge state={r.state} /> },
          { key: 'p', content: r.periods.length ? <Stack space="space.100">{r.periods.map((p) => <PeriodLine key={p.period} p={p} site={data.site} showLabel={r.periods.length > 1} />)}</Stack> : <Text>{r.sinceLabel && r.notTracked ? `Tracked from ${r.sinceLabel}.` : `No ${FREQ[r.frequency].toLowerCase()} period ends in ${data.label}.`}</Text> },
        ],
      }))}
    />
  );
}

function RequestAll({ data, onDone }) {
  const [state, setState] = useState(null);
  if (!data.open) return null;
  const go = async () => {
    setState({ busy: true });
    const r = await invoke('requestAllOpen', { quarter: data.quarter }).catch((e) => ({ ok: false, error: String(e) }));
    setState(r);
    if (r.ok) onDone();
  };
  return (
    <Stack space="space.100">
      <Inline><Button appearance="primary" isDisabled={state?.busy} onClick={go}>{state?.busy ? 'Creating requests…' : `Request evidence for ${data.open} open period${data.open === 1 ? '' : 's'}`}</Button></Inline>
      <Text size="small">Creates one work item per control and period, assigned to the control owner and due on the evidence due date. Periods that already have a request are skipped.</Text>
      {state?.ok && <SectionMessage appearance="success"><Text>{`Created ${state.created.map((c) => c.key).join(', ')}.`}</Text></SectionMessage>}
      {state && state.ok === false && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
    </Stack>
  );
}

function Sample({ onLoaded }) {
  const [state, setState] = useState(null);
  const load = async () => {
    setState({ busy: true });
    const r = await invoke('loadSample').catch((e) => ({ ok: false, error: String(e) }));
    setState(r);
    if (r.ok) onLoaded(r.quarter);
  };
  return (
    <Stack space="space.100">
      <Heading size="small">Sample controls</Heading>
      <Text>Creates eight controls for a fictional company, with evidence files and requests timed so that the last completed quarter shows evidence reviewed, in, requested, late and overdue.</Text>
      <Inline><Button isDisabled={state?.busy || state?.ok} onClick={load}>{state?.busy ? 'Creating controls…' : 'Load sample controls'}</Button></Inline>
      {state?.ok && <SectionMessage appearance="success"><Text>{`Created ${state.keys.join(', ')}.`}</Text></SectionMessage>}
      {state && state.ok === false && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
    </Stack>
  );
}

function App() {
  const [quarter, setQuarter] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setData(null);
    invoke('getOverview', { quarter }).then(setData).catch((e) => setError(String(e)));
  }, [quarter, version]);
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!data) return <Spinner label="Reading controls" />;
  const options = data.quarters.map((q) => ({ label: q.label, value: q.value }));
  return (
    <Stack space="space.200">
      <Heading size="medium">Control evidence</Heading>
      <Text>For each control in this project: the evidence that came in for each period, when, and what is still missing. A control is any work item set up in its Control evidence panel; its evidence is the files on the request work items Tickmark creates, or files on the control whose names carry the period. Dates are in UTC.</Text>
      {data.controls > 0 ? (
        <Stack space="space.150">
          <Inline space="space.100" alignBlock="center">
            <Text>Quarter</Text>
            <Select appearance="default" value={options.find((o) => o.value === data.quarter)} options={options} onChange={(o) => setQuarter(o.value)} />
          </Inline>
          <Text weight="bold">{data.headline}</Text>
          <RequestAll data={data} onDone={() => setVersion((v) => v + 1)} />
          <Overview data={data} />
        </Stack>
      ) : (
        <SectionMessage appearance="information"><Text>No work item in this project is set up as a control yet. Open a work item and use its Control evidence panel, or load the sample controls below.</Text></SectionMessage>
      )}
      <Sample onLoaded={(q) => { setQuarter(q); setVersion((v) => v + 1); }} />
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
