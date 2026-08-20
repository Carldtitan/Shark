"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDollarSign,
  Database,
  Headphones,
  LockKeyhole,
  PhoneCall,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Waves,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type AccountStatus =
  | "needs_contact"
  | "promise_due"
  | "monitoring"
  | "escalated"
  | "blocked"
  | "resolved";

type Memory = {
  id: string;
  type: string;
  summary: string;
  eventAt: string;
  channel: string;
  durable: boolean;
  outcome?: string;
};

type AccountRow = {
  id: string;
  name: string;
  balance: number;
  daysPastDue: number;
  status: AccountStatus;
  riskBand: "low" | "medium" | "high" | "critical";
  propensityToPay: number;
  state: string;
  segment: string;
  nextAction: string;
  blockedReason?: string;
  memories: Memory[];
  allowedOffer: {
    minimumPayment: number;
    maxInstallments: number;
    maxDiscountPercent: number;
  };
};

type DashboardPayload = {
  source: "synthetic" | "elasticsearch";
  generatedAt: string;
  methodology: string;
  summary: {
    accountCount: number;
    totalBalance: number;
    averageDaysPastDue: number;
    contactRate: number;
    promiseRate: number;
    statuses: Record<AccountStatus, number>;
  };
  accounts: AccountRow[];
};

type WorkflowResult = {
  mode: "simulate" | "live";
  disposition: string;
  summary: string;
  nextAction: string;
  callId?: string;
  memory?: Memory;
  steps: {
    id: string;
    label: string;
    detail: string;
    status: "complete" | "blocked";
  }[];
};

const statusLabels: Record<AccountStatus, string> = {
  needs_contact: "Needs contact",
  promise_due: "Promise due",
  monitoring: "Monitoring",
  escalated: "Escalated",
  blocked: "Blocked",
  resolved: "Resolved",
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function relativeDate(value: string) {
  const days = Math.round(
    (new Date(value).getTime() -
      new Date("2026-08-19T18:00:00.000Z").getTime()) /
      86_400_000,
  );
  if (days === 0) return "today";
  if (days === -1) return "yesterday";
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `in ${days}d`;
}

function SignalMark({ status }: { status: AccountStatus }) {
  return <span className={`signal-mark signal-${status}`} aria-hidden="true" />;
}

export function SharkDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<"simulate" | "live" | null>(null);
  const [liveUnlocked, setLiveUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [workflow, setWorkflow] = useState<WorkflowResult | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("The portfolio endpoint did not respond.");
      const payload = (await response.json()) as DashboardPayload;
      setData(payload);
      setSelectedId((current) => current ?? payload.accounts[0]?.id ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load the portfolio.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const accounts = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLowerCase();
    return data.accounts.filter((account) => {
      const matchesStatus =
        statusFilter === "all" || account.status === statusFilter;
      const matchesQuery =
        !normalized ||
        account.name.toLowerCase().includes(normalized) ||
        account.id.toLowerCase().includes(normalized) ||
        account.state.toLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [data, query, statusFilter]);

  const selected =
    data?.accounts.find((account) => account.id === selectedId) ??
    accounts[0] ??
    null;

  async function runWorkflow(mode: "simulate" | "live") {
    if (!selected) return;
    setRunning(mode);
    setError(null);
    setWorkflow(null);
    try {
      const response = await fetch("/api/workflows/collect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: selected.id,
          mode,
          pin: mode === "live" ? pin : undefined,
        }),
      });
      const payload = (await response.json()) as WorkflowResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "The workflow could not be completed.");
      }
      setWorkflow(payload);
      if (payload.memory) {
        setData((current) =>
          current
            ? {
                ...current,
                accounts: current.accounts.map((account) =>
                  account.id === selected.id
                    ? {
                        ...account,
                        nextAction: payload.nextAction,
                        memories: [payload.memory!, ...account.memories],
                      }
                    : account,
                ),
              }
            : current,
        );
      }
      if (mode === "live") setLiveUnlocked(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The workflow failed.");
    } finally {
      setRunning(null);
    }
  }

  if (loading && !data) {
    return (
      <main className="loading-shell" aria-busy="true">
        <div className="brand-lockup">
          <span className="brand-fin" />SHARK
        </div>
        <div className="loading-line"><span /></div>
        <p>Sampling the synthetic portfolio and assembling evidence…</p>
      </main>
    );
  }

  if (!data || !selected) {
    return (
      <main className="error-shell">
        <AlertTriangle size={28} />
        <h1>Portfolio unavailable</h1>
        <p>{error ?? "No account records were returned."}</p>
        <button className="button-primary" onClick={() => void loadDashboard()}>
          <RefreshCw size={15} /> Retry
        </button>
      </main>
    );
  }

  const totalStatus = Object.values(data.summary.statuses).reduce(
    (sum, count) => sum + count,
    0,
  );
  const isBlocked =
    selected.status === "blocked" || Boolean(selected.blockedReason);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Shark">
          <span className="brand-fin" aria-hidden="true" />
          SHARK
          <span className="brand-subtitle">COLLECTION INTELLIGENCE</span>
        </div>
        <div className="system-status">
          <span className={`source-light ${data.source}`} />
          {data.source === "elasticsearch" ? "ELASTIC LIVE" : "SYNTHETIC DEMO"}
          <span className="topbar-divider" />
          <Database size={14} /> {data.summary.accountCount.toLocaleString()} accounts
          <button
            className="icon-button"
            onClick={() => void loadDashboard()}
            aria-label="Refresh portfolio"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <section className="portfolio-strip" aria-label="Portfolio overview">
        <div className="portfolio-title">
          <p>Recovery desk / West</p>
          <h1>Today&apos;s decision field</h1>
          <span>{data.methodology}</span>
        </div>
        <div className="instrument">
          <span>Outstanding</span>
          <strong>{compactMoney.format(data.summary.totalBalance)}</strong>
          <small><ArrowDownRight size={13} /> sampled exposure</small>
        </div>
        <div className="instrument">
          <span>Mean delinquency</span>
          <strong>{data.summary.averageDaysPastDue.toFixed(0)}d</strong>
          <small><Activity size={13} /> across portfolio</small>
        </div>
        <div className="instrument">
          <span>Right-party contact</span>
          <strong>{Math.round(data.summary.contactRate * 100)}%</strong>
          <small><Headphones size={13} /> sampled outcome</small>
        </div>
        <div className="instrument">
          <span>Promise rate</span>
          <strong>{Math.round(data.summary.promiseRate * 100)}%</strong>
          <small><CircleDollarSign size={13} /> after contact</small>
        </div>
      </section>

      <section className="status-distribution" aria-label="Account status distribution">
        {(Object.entries(data.summary.statuses) as [AccountStatus, number][]).map(
          ([status, count]) => (
            <button
              className={`distribution-segment distribution-${status} ${statusFilter === status ? "active" : ""}`}
              style={{ width: `${Math.max(5, (count / totalStatus) * 100)}%` }}
              key={status}
              onClick={() =>
                setStatusFilter(statusFilter === status ? "all" : status)
              }
              title={`${statusLabels[status]}: ${count}`}
            >
              <span>{statusLabels[status]}</span>
              <strong>{count}</strong>
            </button>
          ),
        )}
      </section>

      <div className="workspace-grid">
        <aside className="queue-panel">
          <div className="panel-heading">
            <div><Radar size={16} /><h2>Decision queue</h2></div>
            <span>{accounts.length} shown</span>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search account, state, ID"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="queue-table-head"><span>Account</span><span>Balance</span></div>
          <div className="queue-list">
            {accounts.map((account) => (
              <button
                key={account.id}
                className={`queue-row ${selected.id === account.id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedId(account.id);
                  setWorkflow(null);
                }}
              >
                <SignalMark status={account.status} />
                <span className="queue-person">
                  <strong>{account.name}</strong>
                  <small>{account.id} · {account.daysPastDue}d · {account.state}</small>
                </span>
                <span className="queue-money">
                  <strong>{money.format(account.balance)}</strong>
                  <small>{account.riskBand} risk</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
            {accounts.length === 0 && (
              <div className="empty-state">
                No statistically sampled accounts match this filter.
              </div>
            )}
          </div>
        </aside>

        <section className="case-panel">
          <div className="case-heading">
            <div className="identity-mark"><UserRound size={19} /></div>
            <div>
              <div className="case-name-line">
                <h2>{selected.name}</h2>
                <span className="synthetic-tag">SYNTHETIC</span>
              </div>
              <p>{selected.id} · {selected.segment.replaceAll("_", " ")} · {selected.state}</p>
            </div>
            <div className="case-balance">
              <span>Outstanding balance</span>
              <strong>{money.format(selected.balance)}</strong>
              <small>{selected.daysPastDue} days past due</small>
            </div>
          </div>

          <div className={`policy-ribbon ${isBlocked ? "policy-blocked" : "policy-clear"}`}>
            {isBlocked ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
            <div>
              <strong>
                {isBlocked
                  ? `Blocked: ${selected.blockedReason ?? "policy restriction"}`
                  : "Deterministic policy gate passed"}
              </strong>
              <span>
                {isBlocked
                  ? "Route to a human specialist. No call can be initiated."
                  : "Contact permitted · consented demo destination enforced · offer bounds loaded"}
              </span>
            </div>
          </div>

          <div className="decision-field">
            <div className="recommendation">
              <span className="section-label"><BrainCircuit size={15} /> Agent recommendation</span>
              <h3>{isBlocked ? "Escalate without contact" : selected.nextAction}</h3>
              <p>
                {isBlocked
                  ? "A hard policy fact interrupts the workflow before outreach. The account remains visible for audit."
                  : `Contact propensity is ${Math.round(selected.propensityToPay * 100)}%. Recent evidence supports a bounded conversation now.`}
              </p>
            </div>
            <div className="offer-bounds">
              <span className="section-label"><LockKeyhole size={14} /> Negotiation envelope</span>
              <dl>
                <div><dt>Minimum today</dt><dd>{money.format(selected.allowedOffer.minimumPayment)}</dd></div>
                <div><dt>Maximum term</dt><dd>{selected.allowedOffer.maxInstallments} payments</dd></div>
                <div><dt>Settlement limit</dt><dd>{selected.allowedOffer.maxDiscountPercent}%</dd></div>
              </dl>
            </div>
          </div>

          <div className="action-bay">
            <div>
              <span className="section-label"><Waves size={14} /> Run the closed loop</span>
              <p>Public simulation uses the same Mastra workflow. Live mode calls only the configured consenting number.</p>
            </div>
            <div className="action-buttons">
              <button
                className="button-secondary"
                disabled={Boolean(running) || isBlocked}
                onClick={() => void runWorkflow("simulate")}
              >
                {running === "simulate" ? (
                  <RefreshCw className="spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                {running === "simulate" ? "Running workflow" : "Simulate outcome"}
              </button>
              <button
                className="button-primary"
                disabled={Boolean(running) || isBlocked}
                onClick={() => setLiveUnlocked((value) => !value)}
              >
                <PhoneCall size={15} /> Start consented test call
              </button>
            </div>
          </div>

          {liveUnlocked && !isBlocked && (
            <div className="live-call-gate">
              <div>
                <LockKeyhole size={16} />
                <span>
                  <strong>Live call protected · +1 ••• ••• ••••</strong>
                  Consented recipient is locked in the server environment. Enter the private demo PIN to continue.
                </span>
              </div>
              <label>
                <span className="sr-only">Demo call PIN</span>
                <input
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Demo PIN"
                  autoComplete="off"
                />
              </label>
              <button
                className="button-danger"
                disabled={pin.length < 8 || Boolean(running)}
                onClick={() => void runWorkflow("live")}
              >
                {running === "live" ? (
                  <RefreshCw className="spin" size={15} />
                ) : (
                  <PhoneCall size={15} />
                )}
                {running === "live" ? "Starting call" : "Confirm live call"}
              </button>
            </div>
          )}

          {error && (
            <div className="inline-error">
              <AlertTriangle size={15} />{error}
              <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button>
            </div>
          )}

          {workflow && (
            <div className="outcome-panel">
              <div className="outcome-heading">
                <span className="outcome-check"><Check size={16} /></span>
                <div>
                  <span>{workflow.mode === "live" ? "Vapi call started" : "Outcome simulated"}</span>
                  <h3>{workflow.disposition}</h3>
                </div>
                {workflow.callId && <code>{workflow.callId.slice(0, 12)}…</code>}
              </div>
              <p>{workflow.summary}</p>
              <div className="workflow-rail">
                {workflow.steps.map((step) => (
                  <div className={`workflow-step ${step.status}`} key={step.id}>
                    <span>
                      {step.status === "complete" ? (
                        <Check size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                    </span>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="evidence-panel">
          <div className="panel-heading">
            <div><BrainCircuit size={16} /><h2>Evidence chain</h2></div>
            <span>Elastic recall</span>
          </div>
          <div className="evidence-legend">
            <span><i className="legend-fact" />Stored fact</span>
            <span><i className="legend-memory" />Interaction memory</span>
            <span><i className="legend-inference" />Agent inference</span>
          </div>
          <div className="evidence-chain">
            <div className="evidence-node fact-node">
              <span>STORED FACT</span>
              <strong>{selected.daysPastDue} days past due</strong>
              <small>collection-accounts / current state</small>
            </div>
            {selected.memories.slice(0, 5).map((memory) => (
              <div className="evidence-node memory-node" key={memory.id}>
                <span>{memory.type.toUpperCase()} · {relativeDate(memory.eventAt)}</span>
                <strong>{memory.summary}</strong>
                <small>{memory.channel} · {memory.durable ? "durable fact" : "recency weighted"}</small>
              </div>
            ))}
            {workflow?.memory && (
              <div className="evidence-node memory-node new-memory">
                <span>NEW MEMORY · JUST NOW</span>
                <strong>{workflow.memory.summary}</strong>
                <small>persisted by Mastra workflow</small>
              </div>
            )}
            <div className="evidence-node inference-node">
              <span>AGENT INFERENCE</span>
              <strong>{workflow?.nextAction ?? selected.nextAction}</strong>
              <small>bounded by policy · sources attached</small>
            </div>
          </div>
          <div className="recall-footer">
            <Database size={14} />
            <span><strong>Hybrid retrieval</strong> Exact account filter + lexical/semantic relevance + recency.</span>
          </div>
        </aside>
      </div>

      <footer className="app-footer">
        <span>SHARK / HACKATHON PROTOTYPE</span>
        <span>Mastra orchestration</span>
        <span>Elasticsearch memory</span>
        <span>Vapi voice</span>
        <span>All portfolio records are synthetic</span>
      </footer>
    </main>
  );
}
