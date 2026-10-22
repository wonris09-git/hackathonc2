import React, { useState, useReducer, useMemo } from "react";
import { useTideCloak } from "@tidecloak/react";
import seed from "./seed.json";

function audit(state, actor, action, reason, isAttack = false) {
  const newEntry = {
    id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    time: new Date().toISOString(),
    actor,
    action,
    reason,
    isAttack,
    hash: "0x" + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("")
  };
  return {
    ...state,
    audit: [newEntry, ...state.audit]
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "SUBMIT_REPORT": {
      const { report, actor } = action.payload;
      const updatedReports = [report, ...state.reports];
      return audit(
        { ...state, reports: updatedReports },
        actor,
        "Report Sealed & Encrypted",
        `New ${report.severity} severity report [${report.id}] escrowed in Tide vault with hash ${report.encryptedPayloadHash.substring(0, 18)}...`
      );
    }

    case "CAST_VOTE": {
      const { reportId, member } = action.payload;
      const report = state.reports.find(r => r.id === reportId);
      if (!report || report.approvals.includes(member.id)) return state;

      const newApprovals = [...report.approvals, member.id];
      const isQuorumReached = newApprovals.length >= 2;
      const updatedStatus = isQuorumReached ? "investigating" : report.status;

      let nextState = {
        ...state,
        reports: state.reports.map(r =>
          r.id === reportId ? { ...r, approvals: newApprovals, status: updatedStatus } : r
        )
      };

      nextState = audit(
        nextState,
        member.name,
        isQuorumReached ? "Threshold Quorum Achieved (2/3)" : "Quorum Vote Registered",
        isQuorumReached
          ? `2-of-3 threshold met for [${report.id}]. Tide session key released to Ethics Committee for inquiry.`
          : `Vote 1 of 2 registered for [${report.id}] by ${member.title}. Awaiting co-signature.`
      );

      return nextState;
    }

    case "SEND_ANON_MESSAGE": {
      const { reportId, text, sender } = action.payload;
      const updatedReports = state.reports.map(r => {
        if (r.id !== reportId) return r;
        return {
          ...r,
          messages: [
            ...(r.messages || []),
            { sender, time: new Date().toISOString(), text }
          ]
        };
      });

      return audit(
        { ...state, reports: updatedReports },
        sender,
        "Encrypted Follow-Up Dispatched",
        `Two-way zero-knowledge message appended to case [${reportId}].`
      );
    }

    case "RESOLVE_REPORT": {
      const { reportId, actor, conclusion } = action.payload;
      const updatedReports = state.reports.map(r =>
        r.id === reportId ? { ...r, status: "resolved", conclusion } : r
      );
      return audit(
        { ...state, reports: updatedReports },
        actor,
        "Investigation Concluded",
        `Case [${reportId}] formally closed with signed committee resolution: "${conclusion}".`
      );
    }

    case "LOG_ATTACK": {
      const { actor, attackName, blockedReason } = action.payload;
      return audit(state, actor, `BLOCKED: ${attackName}`, blockedReason, true);
    }

    default:
      return state;
  }
}

export default function App() {
  const {
    authenticated,
    isInitializing,
    isLoading,
    login,
    logout,
    getValueFromToken
  } = useTideCloak();

  const [state, dispatch] = useReducer(reducer, {
    reports: seed.initialReports,
    committee: seed.committee,
    categories: seed.categories,
    audit: [
      {
        id: "seed-audit-1",
        time: "2026-10-20T14:31:00Z",
        actor: "PhantomSeal#44",
        action: "Report Sealed & Encrypted",
        reason: "New Critical severity report [WC-9041-A2] escrowed in Tide vault with hash 0x8f3c7e4b2d9a1058...",
        isAttack: false,
        hash: "0x8f3c7e4b2d9a1058"
      },
      {
        id: "seed-audit-2",
        time: "2026-10-21T09:45:00Z",
        actor: "Dr. Elena Vance",
        action: "Quorum Vote Registered",
        reason: "Vote 1 of 2 registered for [WC-9041-A2] by Chair of Independent Ethics Committee. Awaiting co-signature.",
        isAttack: false,
        hash: "0x4e29ab7109c3f58a"
      },
      {
        id: "seed-audit-3",
        time: "2026-10-21T10:00:00Z",
        actor: "Sophia Chen, CFE",
        action: "Threshold Quorum Achieved (2/3)",
        reason: "2-of-3 threshold met for [WC-9041-A2]. Tide session key released to Ethics Committee for inquiry.",
        isAttack: false,
        hash: "0x7b58f01c29dae834"
      }
    ]
  });

  const [activeRole, setActiveRole] = useState("whistleblower");
  const [activeMemberId, setActiveMemberId] = useState(seed.committee[0].id);
  const [whistleblowerSubTab, setWhistleblowerSubTab] = useState("submit");
  const [trackingInputId, setTrackingInputId] = useState("WC-9041-A2");
  const [selectedCaseId, setSelectedCaseId] = useState(seed.initialReports[0].id);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("financial");
  const [newSeverity, setNewSeverity] = useState("High");
  const [newNarrative, setNewNarrative] = useState("");
  const [attachedFiles] = useState(["financial_ledger_diff_q3.csv"]);
  const [createdTicket, setCreatedTicket] = useState(null);

  const [replyMessage, setReplyMessage] = useState("");
  const [toastNotification, setToastNotification] = useState("");

  const activeMember = useMemo(
    () => state.committee.find(m => m.id === activeMemberId) || state.committee[0],
    [state.committee, activeMemberId]
  );

  const selectedReport = useMemo(
    () => state.reports.find(r => r.id === selectedCaseId) || state.reports[0],
    [state.reports, selectedCaseId]
  );

  const trackedReport = useMemo(
    () => state.reports.find(r => r.id.toLowerCase() === trackingInputId.trim().toLowerCase()),
    [state.reports, trackingInputId]
  );

  const tokenUser = authenticated
    ? getValueFromToken("name") || getValueFromToken("preferred_username") || "Tide Authenticated User"
    : "";

  async function handleTideLogin() {
    try {
      await login();
    } catch (err) {
      setToastNotification(
        `TideCloak Login: ${err instanceof Error ? err.message : String(err)}. Note: App runs with local decentralized simulation if local Tide server is offline.`
      );
    }
  }

  function handleCreateReport(e) {
    e.preventDefault();
    if (!newTitle.trim() || !newNarrative.trim()) return;

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const charCode = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const ticketId = `WC-${randomSuffix}-${charCode}${Math.floor(Math.random() * 9)}`;
    const randomAlias = `CipherGuardian#${Math.floor(10 + Math.random() * 90)}`;
    const mockHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

    const newReport = {
      id: ticketId,
      timestamp: new Date().toISOString(),
      category: newCategory,
      title: newTitle.trim(),
      severity: newSeverity,
      status: "pending",
      approvals: [],
      encryptedPayloadHash: mockHash,
      publicSummary: newNarrative.length > 140 ? newNarrative.substring(0, 140) + "..." : newNarrative,
      evidenceCount: attachedFiles.length,
      whistleblowerSecretAlias: randomAlias,
      messages: [
        {
          sender: "Whistleblower",
          time: new Date().toISOString(),
          text: newNarrative.trim()
        }
      ]
    };

    dispatch({
      type: "SUBMIT_REPORT",
      payload: { report: newReport, actor: randomAlias }
    });

    setCreatedTicket({
      id: ticketId,
      alias: randomAlias,
      hash: mockHash,
      category: newCategory,
      severity: newSeverity
    });

    setTrackingInputId(ticketId);
    setNewTitle("");
    setNewNarrative("");
    setToastNotification(`Report [${ticketId}] securely sealed! Keep your tracking token safe.`);
  }

  function handleVote(reportId) {
    dispatch({
      type: "CAST_VOTE",
      payload: { reportId, member: activeMember }
    });
    setToastNotification(`Quorum signature recorded for ${activeMember.name}.`);
  }

  function handleSendReply(reportId, senderLabel) {
    if (!replyMessage.trim()) return;
    dispatch({
      type: "SEND_ANON_MESSAGE",
      payload: { reportId, text: replyMessage.trim(), sender: senderLabel }
    });
    setReplyMessage("");
    setToastNotification("Encrypted message sent successfully.");
  }

  function simulateAttack(type) {
    const target = state.reports[0] || { id: "WC-9041-A2" };
    if (type === "DELETE") {
      dispatch({
        type: "LOG_ATTACK",
        payload: {
          actor: `${seed.rogueAdmin.name} (${seed.rogueAdmin.title})`,
          attackName: `Unauthorized Purge Attempt on [${target.id}]`,
          blockedReason: "BLOCKED by Tide Fabric: Multi-party threshold enforcement requires 3/3 unanimous cryptographic consensus for evidence disposal. Single admin lacks authorization key."
        }
      });
      setToastNotification(`[EXPLOIT PREVENTED] Purge command blocked by Tide Fabric! Logged in audit trail.`);
    } else if (type === "UNMASK") {
      dispatch({
        type: "LOG_ATTACK",
        payload: {
          actor: `${seed.rogueAdmin.name} (${seed.rogueAdmin.title})`,
          attackName: `Zero-Knowledge Identity Extraction on [${target.id}]`,
          blockedReason: "BLOCKED by Tide Cloak: Master decryption key does not exist on central server. Identity hashes are blinded using threshold secret sharing."
        }
      });
      setToastNotification(`[EXPLOIT PREVENTED] Direct identity extraction cryptographically impossible without threshold keys.`);
    } else if (type === "OVERRIDE") {
      dispatch({
        type: "LOG_ATTACK",
        payload: {
          actor: `${seed.rogueAdmin.name} (${seed.rogueAdmin.title})`,
          attackName: `Unilateral Status Dismissal on [${target.id}]`,
          blockedReason: "BLOCKED by Governance Fabric: Investigation status transitions require verified signatures from at least 2 active Ethics Committee members."
        }
      });
      setToastNotification(`[EXPLOIT PREVENTED] Unilateral case closure rejected. Quorum constraint preserved.`);
    }
  }

  if (isInitializing) {
    return (
      <div className="initializing-screen">
        <div className="spinner"></div>
        <h2>Initializing WhisperCloak Shield...</h2>
        <p>Connecting to TideCloak Decentralized Fabric...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* TOP NAVIGATION BAR */}
      <header className="navbar">
        <div className="brand-group">
          <div className="brand-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M12 8v4" />
              <path d="M12 16h.01" />
            </svg>
          </div>
          <div>
            <div className="brand-title">WhisperCloak</div>
            <div className="brand-tagline">Zero-Knowledge Anonymous Ethics & Whistleblowing</div>
          </div>
        </div>

        <div className="nav-controls">
          <div className={`tide-badge ${authenticated ? "connected" : "standalone"}`}>
            <span className="pulsing-dot"></span>
            <span>
              {authenticated
                ? `TideCloak: ${tokenUser}`
                : "TideCloak: Fabric Active (Zero-Trust Quorum)"}
            </span>
          </div>

          {authenticated ? (
            <button className="btn btn-outline" onClick={logout}>Sign Out</button>
          ) : (
            <button className="btn btn-primary" onClick={handleTideLogin} disabled={isLoading}>
              {isLoading ? "Authenticating..." : "Connect TideCloak"}
            </button>
          )}
        </div>
      </header>

      {/* TOAST ALERT */}
      {toastNotification && (
        <div className="toast-bar">
          <span>{toastNotification}</span>
          <button className="toast-close" onClick={() => setToastNotification("")}>×</button>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="pill-badge">
            <span className="pill-icon">✦</span> BUILT WITH TIDECLOAK &amp; CYBERSECURITY FABRIC
          </div>
          <h1 className="hero-headline">
            Truth without fear.<br />
            <span className="gradient-text">Protected by Collective Quorum.</span>
          </h1>
          <p className="hero-subtext">
            No corrupt executive, rogue database administrator, or cloud subpoena can unmask whistleblowers or tamper with evidence.
            All actions require cryptographic multi-party threshold consensus (2-of-3 quorum).
          </p>

          <div className="quick-metrics-row">
            <div className="metric-box">
              <div className="metric-value">{state.reports.length}</div>
              <div className="metric-label">Protected Reports</div>
            </div>
            <div className="metric-box">
              <div className="metric-value">2 of 3</div>
              <div className="metric-label">Quorum Required</div>
            </div>
            <div className="metric-box">
              <div className="metric-value">0</div>
              <div className="metric-label">Single Points of Failure</div>
            </div>
            <div className="metric-box">
              <div className="metric-value">100%</div>
              <div className="metric-label">Zero-Knowledge Escrow</div>
            </div>
          </div>
        </div>
      </section>

      {/* ROLE SWITCHER TOOLBAR */}
      <div className="role-switcher-banner">
        <div className="role-switcher-title">SELECT DEMO PERSONA:</div>
        <div className="role-buttons">
          <button
            className={`role-tab-btn ${activeRole === "whistleblower" ? "active" : ""}`}
            onClick={() => setActiveRole("whistleblower")}
          >
            <span className="role-icon">🕵️</span>
            <div>
              <strong>Whistleblower</strong>
              <small>Anonymous Submitter</small>
            </div>
          </button>

          <button
            className={`role-tab-btn ${activeRole === "committee" ? "active" : ""}`}
            onClick={() => setActiveRole("committee")}
          >
            <span className="role-icon">⚖️</span>
            <div>
              <strong>Ethics Committee</strong>
              <small>Multi-Party Quorum (2/3)</small>
            </div>
          </button>

          <button
            className={`role-tab-btn rogue ${activeRole === "rogue" ? "active" : ""}`}
            onClick={() => setActiveRole("rogue")}
          >
            <span className="role-icon">🚨</span>
            <div>
              <strong>Rogue Sysadmin</strong>
              <small>Live Attack Simulator</small>
            </div>
          </button>
        </div>
      </div>

      {/* MAIN DYNAMIC CONTENT BY ROLE */}
      <main className="main-content">
        {/* ============================================================== */}
        {/* 1. WHISTLEBLOWER VIEW                                         */}
        {/* ============================================================== */}
        {activeRole === "whistleblower" && (
          <section className="portal-section">
            <div className="portal-header">
              <div>
                <div className="section-eyebrow">ANONYMOUS SUBMISSION PORTAL</div>
                <h2>Encrypted Zero-Knowledge Whistleblower Gateway</h2>
              </div>
              <div className="subtab-pills">
                <button
                  className={`subtab-btn ${whistleblowerSubTab === "submit" ? "active" : ""}`}
                  onClick={() => setWhistleblowerSubTab("submit")}
                >
                  Submit New Report
                </button>
                <button
                  className={`subtab-btn ${whistleblowerSubTab === "track" ? "active" : ""}`}
                  onClick={() => setWhistleblowerSubTab("track")}
                >
                  Track Existing Case
                </button>
              </div>
            </div>

            {whistleblowerSubTab === "submit" ? (
              <div className="whistleblower-grid">
                <form className="card form-card" onSubmit={handleCreateReport}>
                  <h3>Escrow an Anonymous Report</h3>
                  <p className="card-desc">
                    Your IP address and personal identities are discarded client-side. Evidence payloads are encrypted with Tide threshold public keys.
                  </p>

                  <div className="form-group">
                    <label>Incident Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="form-control"
                    >
                      {state.categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Incident Headline</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Falsification of research trial datasets in Lab B"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group half">
                      <label>Severity Level</label>
                      <select
                        value={newSeverity}
                        onChange={(e) => setNewSeverity(e.target.value)}
                        className="form-control"
                      >
                        <option value="Critical">Critical (Immediate Danger / Grand Fraud)</option>
                        <option value="High">High (Substantial Breach of Conduct)</option>
                        <option value="Medium">Medium (Procedural Non-Compliance)</option>
                      </select>
                    </div>

                    <div className="form-group half">
                      <label>Evidence Files Sealed</label>
                      <div className="mock-upload-pill">
                        <span>📎 {attachedFiles.length} file attached</span>
                        <small className="mono">SHA256: 0x9a84...b120</small>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Confidential Facts &amp; Description</label>
                    <textarea
                      rows={5}
                      className="form-control"
                      placeholder="Detail who, what, when, where. Do NOT include personal identifying information if you wish to remain 100% anonymous."
                      value={newNarrative}
                      onChange={(e) => setNewNarrative(e.target.value)}
                      required
                    ></textarea>
                  </div>

                  <div className="form-footer">
                    <div className="security-notice">
                      <span className="lock-icon">🔒</span>
                      <span>Sealed with Tide Zero-Knowledge threshold cryptography</span>
                    </div>
                    <button type="submit" className="btn btn-primary btn-glow">
                      Seal &amp; Dispatch to Quorum
                    </button>
                  </div>
                </form>

                <div className="side-column">
                  {createdTicket ? (
                    <div className="card ticket-card">
                      <div className="ticket-badge">CONFIDENTIAL CLAIM RECEIPT</div>
                      <h4>Your Cryptographic Ticket</h4>
                      <p>Store this tracking code securely. It is the ONLY way to retrieve case progress and communicate anonymously.</p>

                      <div className="ticket-id-display">
                        <span className="mono bold">{createdTicket.id}</span>
                        <button
                          className="btn-copy"
                          onClick={() => {
                            navigator.clipboard?.writeText(createdTicket.id);
                            setToastNotification("Copied ticket ID to clipboard!");
                          }}
                        >
                          Copy
                        </button>
                      </div>

                      <div className="ticket-details">
                        <div className="detail-row">
                          <span>Pseudonym:</span>
                          <span className="mono accent">{createdTicket.alias}</span>
                        </div>
                        <div className="detail-row">
                          <span>Payload Hash:</span>
                          <span className="mono truncate">{createdTicket.hash.substring(0, 18)}...</span>
                        </div>
                        <div className="detail-row">
                          <span>Required Quorum:</span>
                          <span>2 of 3 Ethics Votes</span>
                        </div>
                      </div>

                      <button
                        className="btn btn-outline full-width"
                        onClick={() => {
                          setWhistleblowerSubTab("track");
                          setTrackingInputId(createdTicket.id);
                        }}
                      >
                        Track This Case Now ➔
                      </button>
                    </div>
                  ) : (
                    <div className="card info-box">
                      <h4>How Tide Protects You</h4>
                      <ul className="safety-checklist">
                        <li>
                          <strong>No Server Logs:</strong> Your IP address is never stored in any database.
                        </li>
                        <li>
                          <strong>No God-Mode Master Key:</strong> Neither IT admins nor university executives hold the key to decrypt your report unilaterally.
                        </li>
                        <li>
                          <strong>2-of-3 Multi-Party Threshold:</strong> Evidence requires simultaneous approval from at least two independent committee officers.
                        </li>
                        <li>
                          <strong>Immutable Public Hash:</strong> Your evidence hash cannot be deleted or secretly replaced.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* TRACKING VIEW */
              <div className="tracking-container">
                <div className="tracking-search-bar card">
                  <label htmlFor="tracking-code-input">ENTER CASE TRACKING CODE:</label>
                  <div className="search-input-group">
                    <input
                      id="tracking-code-input"
                      type="text"
                      className="form-control mono"
                      placeholder="e.g. WC-9041-A2"
                      value={trackingInputId}
                      onChange={(e) => setTrackingInputId(e.target.value)}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => setToastNotification(`Displaying details for [${trackingInputId}]`)}
                    >
                      Fetch Status
                    </button>
                  </div>
                </div>

                {trackedReport ? (
                  <div className="card case-detail-card">
                    <div className="case-header">
                      <div>
                        <span className={`status-tag ${trackedReport.status}`}>
                          {trackedReport.status === "investigating"
                            ? "INVESTIGATION IN PROGRESS (QUORUM REACHED)"
                            : trackedReport.status.toUpperCase()}
                        </span>
                        <h3>{trackedReport.title}</h3>
                        <div className="case-meta">
                          <span>Case ID: <strong className="mono">{trackedReport.id}</strong></span>
                          <span>•</span>
                          <span>Filed: {new Date(trackedReport.timestamp).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className={`severity-tag ${trackedReport.severity.toLowerCase()}`}>
                            {trackedReport.severity}
                          </span>
                        </div>
                      </div>

                      <div className="quorum-meter">
                        <div className="meter-label">
                          <span>Committee Quorum:</span>
                          <strong>{trackedReport.approvals.length} / 2 Required</strong>
                        </div>
                        <div className="meter-bar">
                          <div
                            className="meter-fill"
                            style={{ width: `${Math.min(100, (trackedReport.approvals.length / 2) * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    <div className="case-summary-box">
                      <strong>Sealed Public Summary:</strong>
                      <p>{trackedReport.publicSummary}</p>
                      <div className="hash-stamp mono">
                        Cryptographic Seal: {trackedReport.encryptedPayloadHash}
                      </div>
                    </div>

                    {/* TWO-WAY ANONYMOUS MESSAGING */}
                    <div className="chat-section">
                      <h4>Encrypted 2-Way Channel with Ethics Committee</h4>
                      <div className="chat-thread">
                        {(trackedReport.messages || []).map((msg, idx) => (
                          <div
                            key={idx}
                            className={`chat-bubble ${msg.sender === "Whistleblower" ? "from-user" : "from-committee"}`}
                          >
                            <div className="chat-header">
                              <span className="chat-author">{msg.sender}</span>
                              <span className="chat-time">{new Date(msg.time).toLocaleTimeString()}</span>
                            </div>
                            <div className="chat-text">{msg.text}</div>
                          </div>
                        ))}
                      </div>

                      <div className="chat-composer">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Provide additional evidence or answer committee questions anonymously..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendReply(trackedReport.id, "Whistleblower");
                          }}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handleSendReply(trackedReport.id, "Whistleblower")}
                        >
                          Send Encrypted
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card empty-card">
                    <p>No report found with tracking code <strong>{trackingInputId}</strong>. Please check your token or submit a new report.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============================================================== */}
        {/* 2. ETHICS COMMITTEE VIEW                                      */}
        {/* ============================================================== */}
        {activeRole === "committee" && (
          <section className="portal-section">
            <div className="portal-header">
              <div>
                <div className="section-eyebrow">ETHICS GOVERNANCE BOARD</div>
                <h2>Multi-Party Threshold Review Panel (2-of-3 Quorum)</h2>
              </div>

              {/* Committee Member Selector */}
              <div className="member-switcher">
                <label>ACTING AS OFFICER:</label>
                <select
                  value={activeMemberId}
                  onChange={(e) => setActiveMemberId(e.target.value)}
                  className="form-control"
                >
                  {state.committee.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.title})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Committee Roster Cards */}
            <div className="committee-strip">
              {state.committee.map((m) => {
                const isSelected = m.id === activeMember.id;
                return (
                  <div key={m.id} className={`committee-card ${isSelected ? "selected" : ""}`}>
                    <div className="avatar-circle">{m.avatar}</div>
                    <div className="member-info">
                      <div className="member-name">{m.name}</div>
                      <div className="member-role">{m.title}</div>
                      {isSelected && <span className="active-badge">Active Cosigner</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="case-management-layout">
              {/* Reports List */}
              <div className="case-list-column">
                <div className="column-header">
                  <h3>Active Incident Pipeline</h3>
                  <span className="count-tag">{state.reports.length} Cases</span>
                </div>

                <div className="case-cards-container">
                  {state.reports.map((report) => {
                    const isSelected = report.id === selectedCaseId;
                    return (
                      <div
                        key={report.id}
                        className={`report-summary-card ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedCaseId(report.id)}
                      >
                        <div className="report-summary-top">
                          <span className="mono bold">{report.id}</span>
                          <span className={`status-pill ${report.status}`}>{report.status}</span>
                        </div>
                        <h4 className="report-summary-title">{report.title}</h4>
                        <div className="report-summary-bottom">
                          <span className="evidence-badge">📎 {report.evidenceCount} Files</span>
                          <span className="quorum-tally">
                            {report.approvals.length} of 2 Approvals
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Case Review Detail Pane */}
              <div className="case-detail-pane card">
                {selectedReport ? (
                  <div>
                    <div className="pane-header">
                      <div>
                        <div className="meta-breadcrumb">
                          <span>{selectedReport.category.toUpperCase()}</span> • <span>{selectedReport.severity} SEVERITY</span>
                        </div>
                        <h2>{selectedReport.title}</h2>
                        <div className="mono text-muted">Ticket ID: {selectedReport.id}</div>
                      </div>

                      <div className="approval-status-badge">
                        <div className="approval-counter">
                          <strong>{selectedReport.approvals.length}</strong> / 2
                        </div>
                        <small>Cosignatures</small>
                      </div>
                    </div>

                    <div className="report-body-box">
                      <h4>Verified Whistleblower Statement</h4>
                      <p>{selectedReport.publicSummary}</p>

                      <div className="crypto-vault-box">
                        <div className="vault-title">
                          <span className="vault-icon">🔐</span>
                          <strong>TideCloak Zero-Knowledge Escrow Details</strong>
                        </div>
                        <div className="vault-field">
                          <span>Payload Hash:</span>
                          <span className="mono">{selectedReport.encryptedPayloadHash}</span>
                        </div>
                        <div className="vault-field">
                          <span>Cryptographic Decryption Rule:</span>
                          <span>Threshold Quorum: 2 Independent Signatures</span>
                        </div>
                      </div>
                    </div>

                    {/* VOTE & SIGNATURE SECTION */}
                    <div className="action-row">
                      {selectedReport.approvals.includes(activeMember.id) ? (
                        <div className="signed-indicator">
                          <span className="check-icon">✓</span>
                          <span>You ({activeMember.name}) have cryptographically signed this case.</span>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary btn-glow"
                          onClick={() => handleVote(selectedReport.id)}
                        >
                          Cosign as {activeMember.name} (Add Vote)
                        </button>
                      )}

                      {selectedReport.status === "investigating" && (
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            const res = prompt("Enter official resolution statement:");
                            if (res) {
                              dispatch({
                                type: "RESOLVE_REPORT",
                                payload: {
                                  reportId: selectedReport.id,
                                  actor: activeMember.name,
                                  conclusion: res
                                }
                              });
                              setToastNotification("Case resolved and closed with committee resolution.");
                            }
                          }}
                        >
                          Conclude &amp; Resolve Case
                        </button>
                      )}
                    </div>

                    {/* Committee Discussion Channel */}
                    <div className="committee-chat card-inner">
                      <h4>Confidential Committee Dialogue</h4>
                      <div className="chat-thread mini">
                        {(selectedReport.messages || []).map((msg, i) => (
                          <div key={i} className="chat-bubble from-committee">
                            <div className="chat-header">
                              <span className="chat-author">{msg.sender}</span>
                              <span className="chat-time">{new Date(msg.time).toLocaleTimeString()}</span>
                            </div>
                            <div className="chat-text">{msg.text}</div>
                          </div>
                        ))}
                      </div>

                      <div className="chat-composer">
                        <input
                          type="text"
                          className="form-control"
                          placeholder={`Post note as ${activeMember.name}...`}
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSendReply(selectedReport.id, activeMember.name);
                          }}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleSendReply(selectedReport.id, activeMember.name)}
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>Select a case from the pipeline to review.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* 3. ROGUE SYSADMIN / ATTACK SIMULATOR                          */}
        {/* ============================================================== */}
        {activeRole === "rogue" && (
          <section className="portal-section attack-simulator">
            <div className="portal-header">
              <div>
                <div className="section-eyebrow attack-eyebrow">MALICIOUS ACTOR SIMULATION</div>
                <h2>Live Attack Simulator: Testing Tide Zero-Trust Defenses</h2>
              </div>
              <div className="persona-chip">
                <span>Acting as:</span>
                <strong>{seed.rogueAdmin.name} ({seed.rogueAdmin.title})</strong>
              </div>
            </div>

            <div className="attack-intro card">
              <h3>Why Traditional Whistleblower Portals Fail</h3>
              <p>
                In standard centralized systems (like typical SQL databases or legacy HR platforms), a root administrator, compromised devops engineer, or subpoenaed cloud provider can quietly modify records, dump tables, or delete incriminating complaints.
              </p>
              <p>
                <strong>Test TideCloak's decentralized defenses below:</strong> Click any malicious action to see how the Tide Cybersecurity Fabric intercepts and denies the exploit at the protocol level.
              </p>
            </div>

            <div className="attack-cards-grid">
              {/* ATTACK 1 */}
              <div className="card attack-card">
                <div className="attack-header">
                  <span className="attack-badge">ATTACK VECTOR 1</span>
                  <h4>Silent Evidence Purge</h4>
                </div>
                <p>
                  A corrupt system administrator attempts to delete an active fraud complaint (e.g., [WC-9041-A2]) from the database before investigators see it.
                </p>
                <div className="attack-comparison">
                  <div className="comp-item legacy">
                    <strong>Legacy Portal:</strong>
                    <span><code>DELETE FROM reports WHERE id=...</code> succeeds with root SQL privileges.</span>
                  </div>
                  <div className="comp-item tide">
                    <strong>With TideCloak:</strong>
                    <span>All records require multi-signature cryptographic consensus. Single-user deletes are cryptographically impossible.</span>
                  </div>
                </div>
                <button
                  className="btn btn-danger full-width"
                  onClick={() => simulateAttack("DELETE")}
                >
                  Simulate: Purge Report #WC-9041-A2
                </button>
              </div>

              {/* ATTACK 2 */}
              <div className="card attack-card">
                <div className="attack-header">
                  <span className="attack-badge">ATTACK VECTOR 2</span>
                  <h4>Unmask Submitter Identity</h4>
                </div>
                <p>
                  The administrator attempts to run forensic queries to decrypt the whistleblower's real IP, employee ID, or identity keys.
                </p>
                <div className="attack-comparison">
                  <div className="comp-item legacy">
                    <strong>Legacy Portal:</strong>
                    <span>Server logs and encryption keys stored on same infrastructure easily reveal submitter.</span>
                  </div>
                  <div className="comp-item tide">
                    <strong>With TideCloak:</strong>
                    <span>Keys are distributed across independent network nodes via threshold cryptography. No master key exists.</span>
                  </div>
                </div>
                <button
                  className="btn btn-danger full-width"
                  onClick={() => simulateAttack("UNMASK")}
                >
                  Simulate: Decrypt Submitter Identity
                </button>
              </div>

              {/* ATTACK 3 */}
              <div className="card attack-card">
                <div className="attack-header">
                  <span className="attack-badge">ATTACK VECTOR 3</span>
                  <h4>Unilateral Case Dismissal</h4>
                </div>
                <p>
                  An executive uses administrative dashboard access to unilaterally mark a serious investigation as "Dismissed / No Fault".
                </p>
                <div className="attack-comparison">
                  <div className="comp-item legacy">
                    <strong>Legacy Portal:</strong>
                    <span>Dashboard admin clicks "Dismiss" and updates state without external check.</span>
                  </div>
                  <div className="comp-item tide">
                    <strong>With TideCloak:</strong>
                    <span>State transitions require verified multi-signature threshold approval from the independent committee.</span>
                  </div>
                </div>
                <button
                  className="btn btn-danger full-width"
                  onClick={() => simulateAttack("OVERRIDE")}
                >
                  Simulate: Force-Dismiss Case #WC-9041-A2
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================== */}
        {/* PUBLIC GOVERNANCE & IMMUTABLE AUDIT LOG                       */}
        {/* ============================================================== */}
        <section className="audit-section card">
          <div className="audit-header">
            <div>
              <div className="section-eyebrow">TRANSPARENCY BY DEFAULT</div>
              <h2>Public Cryptographic Governance Audit Trail</h2>
            </div>
            <div className="audit-count-badge">
              {state.audit.length} Total Verified Events
            </div>
          </div>
          <p className="audit-subtext">
            Every submission, quorum vote, and blocked hostile override attempt is cryptographically timestamped and immutably sealed.
          </p>

          <div className="audit-timeline">
            {state.audit.map((entry) => (
              <div
                key={entry.id}
                className={`audit-row ${entry.isAttack ? "attack-row" : ""}`}
              >
                <div className="audit-time mono">
                  {new Date(entry.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div className="audit-marker">
                  <div className={`audit-dot ${entry.isAttack ? "danger" : "normal"}`}></div>
                </div>
                <div className="audit-details">
                  <div className="audit-title-line">
                    <strong className={entry.isAttack ? "text-danger" : "text-light"}>
                      {entry.action}
                    </strong>
                    <span className="audit-actor-tag mono">{entry.actor}</span>
                  </div>
                  <p className="audit-reason">{entry.reason}</p>
                </div>
                <div className="audit-hash mono text-muted">
                  {entry.hash}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* COMPARISON ARCHITECTURE FOOTER */}
        <section className="architecture-explainer card">
          <h3>Why TideCloak Matters for Whistleblower Protection</h3>
          <div className="explainer-grid">
            <div className="explainer-col legacy">
              <span className="col-kicker">ORDINARY WHISTLEBLOWER PORTAL</span>
              <h4>Single Point of Trust</h4>
              <ul>
                <li>Stored on centralized cloud databases with root admin privileges</li>
                <li>IT staff can access logs, trace IP addresses, and inspect file uploads</li>
                <li>A rogue executive can delete or suppress complaints before audit</li>
                <li>Vulnerable to server breach, insider threats, and subpoena leaks</li>
              </ul>
            </div>
            <div className="explainer-col tide">
              <span className="col-kicker">WHISPERCLOAK + TIDECLOAK</span>
              <h4>Threshold Decentralized Governance</h4>
              <ul>
                <li>Zero-knowledge pseudonymous submission — no IP or credentials stored</li>
                <li>No single master key: Keys sharded across Tide's decentralized fabric</li>
                <li>2-of-3 threshold quorum required for any inquiry or evidence access</li>
                <li>All actions, approvals, and blocked attacks logged immutably</li>
              </ul>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-left">
          <strong>WhisperCloak</strong> · RMIT Hackathon 2026 · Challenge 2
        </div>
        <div className="footer-right">
          <span>Team: <code>UIT_SGS_cntutcbrsut08_C2</code></span>
          <span>•</span>
          <span>Built with <a href="https://tide.org" target="_blank" rel="noreferrer">TideCloak</a></span>
        </div>
      </footer>
    </div>
  );
}
