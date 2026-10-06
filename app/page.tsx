"use client";
import { useRef, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CodeXml,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  chainName,
  explorer,
  shorten,
  usdcAmount,
  type Chain,
  type Environment,
  type TraceReport,
} from "../lib/model";
import { sampleReport, type SampleId } from "../lib/samples";
export default function Home() {
  const reportRef = useRef<HTMLElement>(null);
  function revealReport() {
    if (window.matchMedia("(max-width: 730px)").matches) {
      requestAnimationFrame(() =>
        reportRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      );
    }
  }
  const [hash, setHash] = useState(""),
    [chain, setChain] = useState<Chain>("ethereum"),
    [env, setEnv] = useState<Environment>("mainnet");
  const [reports, setReports] = useState<TraceReport[]>([
      sampleReport("pending"),
    ]),
    [selected, setSelected] = useState(0),
    [sample, setSample] = useState<SampleId | null>("pending");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const report = reports[selected],
    completed = report.outcome === "completed",
    uncertain = ["unknown", "source-failed"].includes(report.outcome);
  async function trace(input = { hash: hash.trim(), chain, env }) {
    if (!/^0x[\da-fA-F]{64}$/.test(input.hash)) {
      setError("Enter 0x followed by 64 hexadecimal characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/trace?hash=${encodeURIComponent(input.hash)}&chain=${input.chain}&environment=${input.env}`,
      );
      const data = (await response.json()) as {
        error?: string;
        reports?: TraceReport[];
      };
      if (!response.ok)
        throw new Error(data.error || "Lookup could not be completed.");
      if (!data.reports?.length)
        throw new Error("No evidence report was returned.");
      setReports(data.reports);
      setSelected(0);
      setSample(null);
      revealReport();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Lookup could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }
  function loadSample(id: SampleId) {
    setSample(id);
    setReports([sampleReport(id)]);
    setSelected(0);
    setError("");
    revealReport();
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `bridgetrace-${report.sample ? "sample" : report.sourceHash.slice(2, 12)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `BridgeTrace${report.sample ? " — SIMULATED SAMPLE" : ""}\n${report.headline}\n${chainName(report.sourceChain, report.environment)} → ${chainName(report.destinationChain, report.environment)}\nBurn amount: ${usdcAmount(report.amount)} USDC\nSource: ${report.sourceHash}\nObserved: ${report.observedAt}\n${report.stages.map((s) => `${s.title}: ${s.state} — ${s.evidence || s.detail}`).join("\n")}\nNext step: ${report.nextAction}\nGaps: ${report.gaps.join(" ")}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Clipboard is unavailable. Download the JSON report instead.");
    }
  }
  return (
    <div className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-mark">
            <ArrowRightLeft size={23} />
          </span>
          <span>
            Bridge<span className="brand-light">Trace</span>
          </span>
        </a>
        <span className="header-note">CCTP TRANSFER DIAGNOSTICS</span>
        <a
          className="github-link"
          href="https://github.com/rohitguta2432/bridgetrace"
          target="_blank"
          rel="noreferrer"
        >
          <CodeXml size={18} />
          <span>View source</span>
          <ExternalLink size={14} />
        </a>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">FOLLOW THE EVIDENCE</p>
            <h1>Where did your USDC stop?</h1>
            <p className="intro-copy">
              Trace the burn, attestation, and destination receipt. Know which
              step needs attention.
            </p>
          </div>
          <div className="readonly">
            <ShieldCheck size={17} />
            Read-only. No wallet connection.
          </div>
        </div>
        <div className="workspace">
          <aside className="lookup-panel">
            <div className="panel-heading">
              <Search size={18} />
              <h2>Trace a transfer</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void trace();
              }}
            >
              <label htmlFor="network">Source network</label>
              <div className="select-wrap">
                <select
                  id="network"
                  value={chain}
                  onChange={(e) => setChain(e.target.value as Chain)}
                >
                  <option value="ethereum">{chainName("ethereum", env)}</option>
                  <option value="base">{chainName("base", env)}</option>
                </select>
                <ChevronDown size={16} />
              </div>
              <label htmlFor="environment">Environment</label>
              <div className="select-wrap">
                <select
                  id="environment"
                  value={env}
                  onChange={(e) => setEnv(e.target.value as Environment)}
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="testnet">Testnet</option>
                </select>
                <ChevronDown size={16} />
              </div>
              <label htmlFor="txhash">Source transaction hash</label>
              <textarea
                id="txhash"
                placeholder="0x…"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
              />
              <p className="field-note">
                Use the transaction that burned USDC through CCTP V2.
              </p>
              <button className="trace-button" disabled={loading}>
                {loading ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Search size={18} />
                )}{" "}
                {loading ? "Collecting evidence…" : "Trace transfer"}
              </button>
            </form>
            {error && (
              <div className="error-box" role="alert">
                <TriangleAlert size={17} />
                <span>{error}</span>
              </div>
            )}
            <div className="sample-section">
              <p className="eyebrow">EXPLORE A SAMPLE</p>
              <p className="sample-copy">See how each transfer stage reads.</p>
              <div className="sample-options">
                {(
                  [
                    { id: "pending", label: "Receipt pending" },
                    { id: "waiting", label: "Awaiting attestation" },
                    { id: "completed", label: "Received on Base" },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSample(s.id)}
                    className={`sample-option ${sample === s.id ? "active" : ""}`}
                    aria-pressed={sample === s.id}
                  >
                    {s.id === "completed" ? (
                      <Check size={16} />
                    ) : (
                      <Clock3 size={16} />
                    )}{" "}
                    {s.label}
                    <span className="option-dot" />
                  </button>
                ))}
              </div>
              <p className="sample-disclosure">
                Simulated data · no funds are moved.
              </p>
            </div>
            <div className="scope-note">
              <CircleHelp size={17} />
              <p>
                CCTP V2 between Ethereum and Base, including their Sepolia
                testnets.
              </p>
            </div>
          </aside>
          <section
            ref={reportRef}
            className="report-panel"
            aria-label="Transfer evidence report"
            aria-busy={loading}
          >
            <div className="report-topline">
              <span className="eyebrow">
                <FileCheck2 size={15} />
                TRANSFER REPORT
              </span>
              <span
                className={`mode-badge ${report.sample ? "sample-badge" : ""}`}
              >
                {report.sample ? "SIMULATED SAMPLE" : "LIVE LOOKUP"}
              </span>
            </div>
            {reports.length > 1 && (
              <div className="message-picker">
                <label htmlFor="message">Messages in this transaction</label>
                <select
                  id="message"
                  value={selected}
                  onChange={(e) => setSelected(Number(e.target.value))}
                >
                  {reports.map((r, i) => (
                    <option key={r.nonce || i} value={i}>
                      Message {i + 1} · {usdcAmount(r.amount)} USDC
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="transfer-summary">
              <div>
                <span className="metadata-label">BURN AMOUNT</span>
                <div className="amount">
                  {usdcAmount(report.amount)} <span>USDC</span>
                </div>
              </div>
              <div className="route-chip">
                <span>
                  <span
                    className={`chain-symbol ${report.sourceChain === "ethereum" ? "eth-symbol" : "base-symbol"}`}
                  >
                    {report.sourceChain === "ethereum" ? "Ξ" : ""}
                  </span>
                  {chainName(report.sourceChain, report.environment)}
                </span>
                <ArrowRightLeft size={17} />
                <span>
                  <span
                    className={`chain-symbol ${report.destinationChain === "ethereum" ? "eth-symbol" : "base-symbol"}`}
                  >
                    {report.destinationChain === "ethereum" ? "Ξ" : ""}
                  </span>
                  {chainName(report.destinationChain, report.environment)}
                </span>
              </div>
            </div>
            <div
              className={`diagnosis ${completed ? "success" : uncertain ? "uncertain" : ""}`}
              role="status"
            >
              <span className="diagnosis-icon">
                {completed ? (
                  <Check size={21} />
                ) : uncertain ? (
                  <CircleHelp size={21} />
                ) : (
                  <Clock3 size={21} />
                )}
              </span>
              <div>
                <p className="diagnosis-kicker">
                  {completed
                    ? "RECEIPT CONFIRMED"
                    : uncertain
                      ? "CHECK INCOMPLETE"
                      : "CURRENT STAGE"}
                </p>
                <h2>{report.headline}</h2>
                <p>{report.explanation}</p>
              </div>
            </div>
            <div className="journey" aria-label="Transfer stages">
              {report.stages.map((s, i) => (
                <div className={`stage ${s.state}`} key={s.id}>
                  <div className="stage-track">
                    <span className="stage-node">
                      {s.state === "complete" ? (
                        <Check size={17} />
                      ) : s.state === "unknown" ? (
                        <CircleHelp size={17} />
                      ) : ["expired", "failed"].includes(s.state) ? (
                        <TriangleAlert size={17} />
                      ) : (
                        <Clock3 size={17} />
                      )}
                    </span>
                    {i < 2 && <span className="stage-line" />}
                  </div>
                  <span className="stage-number">0{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p className="stage-detail">{s.detail}</p>
                  <p className="stage-evidence">
                    {s.evidence || "No evidence returned"}
                  </p>
                </div>
              ))}
            </div>
            <div className="next-step">
              <div className="next-label">
                <ArrowRightLeft size={16} />
                <h3>What to do next</h3>
              </div>
              <p>{report.nextAction}</p>
              <a
                href="https://developers.circle.com/cctp/references/technical-guide"
                target="_blank"
                rel="noreferrer"
              >
                Circle’s transfer guide <ExternalLink size={13} />
              </a>
            </div>
            <details className="evidence-details">
              <summary>
                Inspect the evidence <ChevronDown size={16} />
              </summary>
              <dl>
                <div>
                  <dt>Source hash</dt>
                  <dd>
                    {report.sample ? (
                      <code>{shorten(report.sourceHash)}</code>
                    ) : (
                      <a
                        href={`${explorer(report.sourceChain, report.environment)}/tx/${report.sourceHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shorten(report.sourceHash)} <ExternalLink size={12} />
                      </a>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>
                    <code>
                      {report.recipient ? shorten(report.recipient) : "Unknown"}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Message nonce</dt>
                  <dd>
                    <code>
                      {report.nonce ? shorten(report.nonce) : "Unknown"}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt>Forwarding state</dt>
                  <dd>{report.forwarding || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Observed at</dt>
                  <dd>
                    {report.observedAt.replace("T", " ").slice(0, 19)} UTC
                  </dd>
                </div>
                {report.destinationHash && (
                  <div>
                    <dt>Destination transaction</dt>
                    <dd>
                      <a
                        href={`${explorer(report.destinationChain, report.environment)}/tx/${report.destinationHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shorten(report.destinationHash)}{" "}
                        <ExternalLink size={12} />
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </details>
            {report.gaps.length > 0 && (
              <p className="gaps">
                <CircleHelp size={14} />
                <span>{report.gaps.join(" ")}</span>
              </p>
            )}
            <div className="report-actions">
              <button onClick={() => void copy()}>
                <Copy size={15} />
                {copied ? "Copied" : "Copy support summary"}
              </button>
              <button onClick={download}>
                <Download size={15} />
                Download JSON
              </button>
              {!report.sample && (
                <button
                  onClick={() =>
                    void trace({
                      hash: report.sourceHash,
                      chain: report.sourceChain,
                      env: report.environment,
                    })
                  }
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  Refresh
                </button>
              )}
            </div>
          </section>
        </div>
        <footer>
          <span>
            BridgeTrace <span className="divider">/</span> Evidence before
            assumptions.
          </span>
          <span>
            Built by{" "}
            <a href="https://rohitraj.tech" target="_blank" rel="noreferrer">
              Rohit Raj
            </a>
            <span className="divider">·</span>Independent tool; Circle + public
            RPC data.
          </span>
        </footer>
      </main>
    </div>
  );
}
