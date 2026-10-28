import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Checkbox, DynamicTable, Inline, Label, Lozenge, SectionMessage, Select, Spinner, Stack, Text, TextArea, Textfield } from '@forge/react';
import { invoke } from '@forge/bridge';
import { StateLozenge, PeriodLine } from './common.jsx';

const FREQ = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Yearly' };
const UNIT = { monthly: 'month', quarterly: 'quarter', annual: 'year' };
const REQUESTABLE = new Set(['not-requested', 'overdue']);

function Setup({ view, onSaved, onCancel }) {
  const s = view.control?.setup || {};
  const [controlId, setControlId] = useState(s.controlId || '');
  const [frequency, setFrequency] = useState(s.frequency || 'quarterly');
  const [grace, setGrace] = useState(s.graceDays != null ? String(s.graceDays) : '');
  const [evidence, setEvidence] = useState(s.evidence || '');
  const [keyControl, setKeyControl] = useState(!!s.keyControl);
  const [since, setSince] = useState(s.since || '');
  const [state, setState] = useState(null);
  const options = view.frequencies.map((f) => ({ label: FREQ[f], value: f }));
  const save = async () => {
    setState({ busy: true });
    const r = await invoke('saveSetup', { setup: { controlId, frequency, graceDays: grace, evidence, keyControl, since } }).catch((e) => ({ ok: false, error: String(e) }));
    setState(r);
    if (r.ok) onSaved(r.view);
  };
  return (
    <Stack space="space.100">
      <Label labelFor="cid">Control ID</Label>
      <Textfield id="cid" value={controlId} placeholder="ITGC-01" onChange={(e) => setControlId(e.target.value)} />
      <Label labelFor="freq">How often it runs</Label>
      <Select inputId="freq" value={options.find((o) => o.value === frequency)} options={options} onChange={(o) => setFrequency(o.value)} />
      <Label labelFor="grace">{`Days after each ${UNIT[frequency]} ends to provide the evidence`}</Label>
      <Textfield id="grace" value={grace} placeholder={String(view.defaults[frequency])} onChange={(e) => setGrace(e.target.value)} />
      <Label labelFor="since">First period to track</Label>
      <Textfield id="since" value={since} placeholder={frequency === 'monthly' ? '2026-09' : frequency === 'quarterly' ? '2026-Q3' : '2026'} onChange={(e) => setSince(e.target.value)} />
      <Label labelFor="ev">Evidence needed</Label>
      <TextArea id="ev" value={evidence} placeholder="Signed user access listing with the reviewer's approvals" onChange={(e) => setEvidence(e.target.value)} />
      <Checkbox label="Key control" isChecked={keyControl} onChange={(e) => setKeyControl(e.target.checked)} />
      <Inline space="space.100">
        <Button appearance="primary" isDisabled={state?.busy} onClick={save}>{state?.busy ? 'Saving…' : 'Save'}</Button>
        {onCancel && <Button appearance="subtle" onClick={onCancel}>Cancel</Button>}
      </Inline>
      {state && state.ok === false && <SectionMessage appearance="error"><Text>{state.error}</Text></SectionMessage>}
    </Stack>
  );
}

function Periods({ view, onChange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const ask = async (period) => {
    setBusy(period);
    setError(null);
    const r = await invoke('requestOne', { period }).catch((e) => ({ ok: false, error: String(e) }));
    setBusy(null);
    if (r.ok) onChange(r.view); else setError(r.error);
  };
  return (
    <Stack space="space.100">
      <DynamicTable
        head={{ cells: [{ key: 'p', content: 'Period' }, { key: 's', content: 'Status' }, { key: 'd', content: 'Evidence' }, { key: 'a', content: '' }] }}
        rows={view.periods.map((p) => ({
          key: p.period,
          cells: [
            { key: 'p', content: <Text>{p.label}</Text> },
            { key: 's', content: <StateLozenge state={p.state} /> },
            { key: 'd', content: <PeriodLine p={p} site={view.site} showLabel={false} /> },
            { key: 'a', content: !p.request && REQUESTABLE.has(p.state) ? <Button isDisabled={!!busy} onClick={() => ask(p.period)}>{busy === p.period ? 'Requesting…' : 'Request evidence'}</Button> : <Text>{''}</Text> },
          ],
        }))}
      />
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
    </Stack>
  );
}

function App() {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => { invoke('getControl').then(setView).catch((e) => setError(String(e))); }, []);
  if (error) return <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>;
  if (!view) return <Spinner label="Reading evidence" />;
  if (!view.control) {
    return (
      <Stack space="space.100">
        <Text>This work item is not set up as a control. Set it up to track the evidence for each period.</Text>
        <Setup view={view} onSaved={setView} />
      </Stack>
    );
  }
  const s = view.control.setup;
  if (editing) return <Setup view={view} onSaved={(v) => { setView(v); setEditing(false); }} onCancel={() => setEditing(false)} />;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Text weight="bold">{s.controlId || view.control.key}</Text>
        <Text>{`${FREQ[s.frequency]}; evidence due ${s.graceDays} day${s.graceDays === 1 ? '' : 's'} after each ${UNIT[s.frequency]} ends${s.since ? `; tracked from ${s.sinceLabel || s.since}` : ''}`}</Text>
        {s.keyControl && <Lozenge>Key control</Lozenge>}
        <Button appearance="subtle" onClick={() => setEditing(true)}>Edit</Button>
      </Inline>
      {s.evidence && <Text>{`Evidence needed: ${s.evidence}`}</Text>}
      <Periods view={view} onChange={setView} />
      <Text size="small">Evidence is the files on a period's request work item, or files on this control whose names carry the period (for example 2026-09 or Q3 2026). A request marked done counts as reviewed. Dates are in UTC.</Text>
    </Stack>
  );
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
