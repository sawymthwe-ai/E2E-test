(function () {
  "use strict";

  var STORAGE_KEY = "dcm_prototype_v4";
  var VIEW_META = {
    "audit-center": { eyebrow: "Audit Center", title: "Discharge Audit Dashboard | Run 1 Baseline" },
    "patients": { eyebrow: "Audit Center", title: "My Patients | Run 1 Baseline" },
    "reports": { eyebrow: "Audit Center", title: "Audit Reports | Run 1 Baseline" },
    "audit-log": { eyebrow: "Audit Center", title: "Audit Log | Run 1 Baseline" },
    "settings": { eyebrow: "Audit Center", title: "Settings" }
  };
  var EVENT_LABEL = {
    check_run: "Check run",
    view: "View",
    edit: "Edit",
    resolve: "Resolve",
    recheck: "Re-check",
    login: "Login",
    login_failed: "Login failed",
    logout: "Logout",
    export: "Export"
  };

  var state;
  var session = null;
  var currentView = "audit-center";
  var filters = { search: "", severity: "All" };
  var activeDrawer = null;
  var activeDemo = null;
  var lastFocused = null;
  var toastTimer = null;
  var sessionTimer = null;
  var lockTimer = null;
  var activeLock = null;
  var warningShown = false;
  var loginBusy = false;
  var lastTouch = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDateTime(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(String(value).slice(0, 10) + "T00:00:00Z");
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  function pct(value) {
    if (value == null || isNaN(value)) return "N/A";
    return Math.round(value * 100) + "%";
  }

  function initials(name) {
    return String(name || "").split(/\s+/).filter(function (part) {
      return part && part !== "Dr." && part !== "Dr";
    }).map(function (part) {
      return part.charAt(0);
    }).join("").slice(0, 2).toUpperCase() || "U";
  }

  function nextDay(dateStr) {
    var d = new Date(String(dateStr || "").slice(0, 10) + "T00:00:00Z");
    if (isNaN(d.getTime())) return "";
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function makeEvent(s, data) {
    s.seq += 1;
    return {
      event_id: "EVT-" + String(s.seq).padStart(4, "0"),
      patient_id: data.patient_id || "-",
      encounter_id: data.encounter_id || "-",
      event_type: data.event_type,
      actor_id: data.actor_id,
      role: data.role,
      timestamp: data.timestamp || new Date().toISOString(),
      rule_id: data.rule_id || "-",
      before: data.before == null ? "-" : String(data.before),
      after: data.after == null ? "-" : String(data.after),
      reason_code: data.reason_code || "-"
    };
  }

  function seedAudit(s) {
    var base = new Date(DCM_SEED.checkedAt).getTime();
    s.records.forEach(function (patient, pi) {
      (patient.checks || []).forEach(function (check, ci) {
        s.audit.push(makeEvent(s, {
          patient_id: patient.id,
          encounter_id: patient.encounterId,
          event_type: "check_run",
          actor_id: "DCM Checklist + Safety Engine",
          role: check.owner,
          timestamp: new Date(base + pi * 60000 + ci * 1000).toISOString(),
          rule_id: check.id,
          before: "-",
          after: check.status + " / " + check.handoffStatus,
          reason_code: "initial_check"
        }));
      });
    });
  }

  function freshState() {
    var s = {
      version: 4,
      records: JSON.parse(JSON.stringify(DCM_SEED.patients)),
      audit: [],
      seq: 0
    };
    seedAudit(s);
    return s;
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshState();
      var parsed = JSON.parse(raw);
      if (parsed && parsed.version === 4 && Array.isArray(parsed.records) &&
          parsed.records.length === DCM_SEED.patients.length && Array.isArray(parsed.audit)) {
        return parsed;
      }
    } catch (e) {}
    return freshState();
  }

  function save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function addAudit(eventType, patientId, encounterId, ruleId, before, after, reason) {
    if (!session) return;
    state.audit.push(makeEvent(state, {
      patient_id: patientId || "-",
      encounter_id: encounterId || "-",
      event_type: eventType,
      actor_id: session.name,
      role: session.role,
      rule_id: ruleId || "-",
      before: before,
      after: after,
      reason_code: reason
    }));
    save();
  }

  function addAuthAudit(eventType, actor, role, reason, before, after) {
    state.audit.push(makeEvent(state, {
      patient_id: "AUTH",
      encounter_id: "AUTH",
      event_type: eventType,
      actor_id: actor || "Unknown",
      role: role || "Unknown",
      rule_id: "AUTH",
      before: before || "-",
      after: after || "-",
      reason_code: reason || "-"
    }));
    save();
  }

  function currentRows() {
    if (!session) return [];
    return DCMEngine.filterByRole(state.records, session.role, filters);
  }

  function roleOpenRows() {
    if (!session) return [];
    return DCMEngine.filterByRole(state.records, session.role);
  }

  function currentMetrics() {
    if (!session) return null;
    return DCMEngine.computeMetrics(state.records, session.role);
  }

  function visibleAudit() {
    if (!session) return [];
    return state.audit.filter(function (event) {
      return event.role === session.role || event.actor_id === session.name;
    }).slice().reverse();
  }

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      el.classList.remove("show");
    }, 4200);
  }

  function setView(view) {
    if (!VIEW_META[view]) return;
    currentView = view;
    closeDrawer(false);
    closeNotifications();
    closeSidebar();
    renderAll();
    window.scrollTo(0, 0);
  }

  function showApp() {
    $("login-view").hidden = true;
    $("app-view").hidden = false;
    document.body.classList.remove("sidebar-open");
  }

  function showLogin(message, kind) {
    $("app-view").hidden = true;
    $("login-view").hidden = false;
    closeDrawer(false);
    closeNotifications();
    closeSidebar();
    $("session-warning").hidden = true;
    warningShown = false;
    var alert = $("login-alert");
    if (message) {
      alert.textContent = message;
      alert.className = "login-alert " + (kind || "error");
      alert.hidden = false;
    } else {
      alert.textContent = "";
      alert.className = "login-alert";
      alert.hidden = true;
    }
    setLoginBusy(false);
    updateLoginButton();
    window.setTimeout(function () {
      if (!$("login-name").disabled) $("login-name").focus();
    }, 40);
  }

  function setLoginBusy(busy) {
    loginBusy = busy;
    var form = $("login-form");
    var fields = form.querySelectorAll("input, button");
    for (var i = 0; i < fields.length; i += 1) fields[i].disabled = busy;
    $("login-submit").textContent = busy ? "Signing in..." : "Sign in";
    $("login-form").setAttribute("aria-busy", busy ? "true" : "false");
    if (!busy) updateLoginButton();
  }

  function updateLoginButton() {
    var ready = $("login-name").value.trim() && $("login-password").value;
    $("login-submit").disabled = !!loginBusy || !ready;
  }

  function setFieldError(fieldId, message) {
    var error = $(fieldId + "-error");
    var input = $(fieldId);
    if (error) {
      error.textContent = message || "";
      error.hidden = !message;
    }
    if (input && input.parentElement) input.parentElement.classList.toggle("has-error", !!message);
  }

  function clearLoginErrors() {
    setFieldError("login-name", "");
    setFieldError("login-password", "");
  }

  function applyLock(lock) {
    if (!lock) return;
    activeLock = lock;
    if (lockTimer) window.clearInterval(lockTimer);
    var alert = $("login-alert");
    alert.className = "login-alert error";
    alert.hidden = false;
    $("login-submit").disabled = true;
    $("login-name").disabled = true;
    $("login-password").disabled = true;

    function tick() {
      var remaining = Math.max(0, activeLock.lockedUntil - Date.now());
      if (remaining <= 0) {
        window.clearInterval(lockTimer);
        lockTimer = null;
        activeLock = null;
        $("login-name").disabled = false;
        $("login-password").disabled = false;
        alert.hidden = true;
        setLoginBusy(false);
        updateLoginButton();
        $("login-name").focus();
        return;
      }
      var seconds = Math.ceil(remaining / 1000);
      var mm = Math.floor(seconds / 60);
      var ss = seconds % 60;
      alert.textContent = "Too many attempts. Try again in " + mm + ":" + String(ss).padStart(2, "0") + ".";
    }

    tick();
    lockTimer = window.setInterval(tick, 1000);
  }

  function handleLogin(event) {
    event.preventDefault();
    if (loginBusy) return;
    clearLoginErrors();

    var name = $("login-name").value.trim();
    var password = $("login-password").value;
    var hasError = false;

    if (!name) {
      setFieldError("login-name", "Enter your name or staff ID.");
      hasError = true;
    }
    if (!password) {
      setFieldError("login-password", "Enter your password.");
      hasError = true;
    }
    if (hasError) return;

    setLoginBusy(true);
    window.setTimeout(function () {
      var result = DCMAuth.authenticate({ name: name, password: password });
      if (!result.ok) {
        var known = DCMAuth.findUser(name);
        addAuthAudit("login_failed", name, known ? known.role : "Unknown",
          result.reason === "locked" ? "locked_out" : "invalid_credentials", "-", "Rejected");
        setLoginBusy(false);
        if (result.lock || result.reason === "locked") {
          applyLock(result.lock || DCMAuth.lockState(name));
          return;
        }
        var alert = $("login-alert");
        alert.textContent = "Name or password is incorrect.";
        alert.className = "login-alert error";
        alert.hidden = false;
        $("login-password").value = "";
        $("login-password").focus();
        updateLoginButton();
        return;
      }
      completeLogin(result.user, result.session, false);
    }, 320);
  }

  function completeLogin(user, sessionObj, quiet) {
    session = sessionObj;
    DCMAuth.saveSession(session);
    addAuthAudit("login", session.name, session.role, "demo_login", "-", "Signed in");
    $("login-form").reset();
    $("login-password").value = "";
    $("login-alert").hidden = true;
    clearLoginErrors();
    setLoginBusy(false);
    showApp();
    currentView = "audit-center";
    filters.search = "";
    filters.severity = "All";
    $("search-input").value = "";
    $("severity-filter").value = "All";
    warningShown = false;
    lastTouch = Date.now();
    renderAll();
    startSessionClock();
    if (!quiet) toast("Signed in - opening your queue.");
  }

  function signOut(reason, message) {
    if (session) addAuthAudit("logout", session.name, session.role, reason, "Signed in", "Signed out");
    DCMAuth.clearSession();
    session = null;
    activeDemo = null;
    activeDrawer = null;
    warningShown = false;
    stopSessionClock();
    closeNotifications();
    closeSidebar();
    showLogin(message || "", reason === "inactivity" ? "info" : "");
  }

  function startSessionClock() {
    stopSessionClock();
    sessionTimer = window.setInterval(tickSession, 1000);
  }

  function stopSessionClock() {
    if (sessionTimer) window.clearInterval(sessionTimer);
    sessionTimer = null;
  }

  function tickSession() {
    if (!session) return;
    var remaining = DCMAuth.remainingMs(session);
    if (remaining <= 0) {
      signOut("inactivity", "Your session expired. Sign in again to continue.");
      return;
    }
    if (remaining <= DCMAuth.WARNING_MS && !warningShown) {
      warningShown = true;
      $("session-warning").hidden = false;
    }
  }

  function activityPulse() {
    if (!session || warningShown) return;
    var now = Date.now();
    if (now - lastTouch < 15000) return;
    lastTouch = now;
    DCMAuth.touchSession(session);
  }

  function updateHeader() {
    if (!session) return;
    $("user-avatar").textContent = initials(session.name);
    $("user-name").textContent = session.name;
    $("user-role").textContent = session.role + " · " + session.staffId;
  }

  function renderAll() {
    if (!session) return;
    updateHeader();
    var meta = VIEW_META[currentView] || VIEW_META["audit-center"];
    $("page-eyebrow").textContent = meta.eyebrow;
    $("page-title").textContent = meta.title;
    $("audit-period").textContent = DCM_SEED.auditPeriod;
    $("role-scope").textContent = session.role + " view - only items owned by your role";
    $("run-status").textContent = DCM_SEED.runStatus;

    var isAudit = currentView === "audit-log";
    var isSettings = currentView === "settings";
    var isPatients = currentView === "patients";
    var isReports = currentView === "reports";

    $("overview-grid").hidden = isAudit || isSettings;
    $("dashboard-content").hidden = isAudit || isSettings;
    $("audit-panel").hidden = !isAudit;
    $("settings-panel").hidden = !isSettings;
    $("pipeline-panel").hidden = isReports;
    $("defect-panel").hidden = isPatients;
    $("metrics-panel").hidden = isPatients;
    $("resolved-panel").hidden = isPatients;
    $("demo-panel").hidden = isPatients || isReports;
    $("export-btn").hidden = isAudit || isSettings;
    $("run-demo-btn").hidden = isAudit || isSettings;

    var navButtons = document.querySelectorAll(".nav-item");
    for (var i = 0; i < navButtons.length; i += 1) {
      navButtons[i].classList.toggle("active", navButtons[i].getAttribute("data-view") === currentView);
    }

    renderKPIs();
    renderDonut();
    renderPipeline();
    renderDefectLog();
    renderMetrics();
    renderRecentlyResolved();
    renderNotifications();
    renderDemoCases();
    renderDemoCoach();
    if (isAudit) renderAudit();
    if (isSettings) renderSettings();
    $("nav-open-count").textContent = roleOpenRows().length;
  }

  function renderKPIs() {
    var m = currentMetrics();
    $("kpi-patients").textContent = m.totalPatients;
    $("kpi-flagged").textContent = m.flaggedPatients;
    $("kpi-defect-rate").textContent = pct(m.defectRate);
    $("kpi-accuracy").textContent = pct(m.accuracy);
  }

  function renderDonut() {
    var el = $("donut-card");
    var m = currentMetrics();
    if (!m.totalChecks) {
      el.innerHTML = '<span class="kpi-label">Pass / Fail</span><p class="empty-note">No checks are assigned to your role.</p>';
      return;
    }
    var ratio = m.passedChecks / m.totalChecks;
    var radius = 46;
    var circumference = 2 * Math.PI * radius;
    var dash = ratio * circumference;
    el.innerHTML =
      '<div class="donut-card-head"><span class="kpi-label">Pass / Fail</span><span class="count-chip">' + m.totalChecks + ' checks</span></div>' +
      '<div class="donut-wrap">' +
        '<svg viewBox="0 0 120 120" role="img" aria-label="' + m.passedChecks + ' passed checks and ' + m.openChecks + ' failed or open checks">' +
          '<circle class="donut-track" cx="60" cy="60" r="' + radius + '"></circle>' +
          '<circle class="donut-arc" cx="60" cy="60" r="' + radius + '" stroke-dasharray="' + dash + ' ' + circumference + '" transform="rotate(-90 60 60)"></circle>' +
        '</svg>' +
        '<div class="donut-center"><strong>' + pct(ratio) + '</strong><span>Accuracy</span></div>' +
      '</div>' +
      '<div class="donut-legend">' +
        '<span><i class="legend-dot pass"></i>Passed <strong>' + m.passedChecks + '</strong></span>' +
        '<span><i class="legend-dot fail"></i>Failed / open <strong>' + m.openChecks + '</strong></span>' +
      '</div>';
  }

  function handoffChip(status) {
    var cls = status === "Completed" ? "pass" : status === "Partial" ? "pending" : "fail";
    var icon = status === "Completed" ? "\u2713" : status === "Partial" ? "!" : "\u2715";
    return '<span class="chip chip-' + cls + '"><span aria-hidden="true">' + icon + '</span>' + esc(status || "Unknown") + '</span>';
  }

  function statusChip(status) {
    var cls = status === "Passed" ? "pass" : status === "Partial" ? "pending" : "fail";
    var icon = status === "Passed" ? "\u2713" : status === "Partial" ? "!" : "\u2715";
    return '<span class="chip chip-' + cls + '"><span aria-hidden="true">' + icon + '</span>' + esc(status || "Unknown") + '</span>';
  }

  function severityChip(severity) {
    var cls = severity === "High" ? "sev-high" : severity === "Medium" ? "sev-medium" : "sev-low";
    return '<span class="severity-chip ' + cls + '">' + esc(severity || "Low") + '</span>';
  }

  function renderPipeline() {
    var rows = currentRows();
    var body = $("pipeline-body");
    $("pipeline-count").textContent = rows.length + (rows.length === 1 ? " item" : " items");

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><strong>No incomplete items for you. Great work.</strong><p>Only failed, partial or incomplete items owned by your role appear here.</p></div></td></tr>';
      return;
    }

    body.innerHTML = rows.map(function (row) {
      var p = row.patient;
      var c = row.check;
      return '<tr>' +
        '<td><span class="cell-strong">' + esc(p.id) + '</span><span class="row-sub">' + esc(p.encounterId) + '</span></td>' +
        '<td><span class="cell-strong">' + esc(p.name) + '</span><span class="row-sub">' + esc(p.department) + '</span></td>' +
        '<td>' + handoffChip(c.handoffStatus) + '</td>' +
        '<td>' + statusChip(c.status) + '<span class="row-sub">' + severityChip(c.severity) + '</span></td>' +
        '<td><span class="notes-title">' + esc(c.title) + '</span><span class="row-sub">' + esc(c.why) + '</span></td>' +
        '<td><div class="row-actions">' +
          '<button class="btn small ghost" type="button" data-action="view" data-patient="' + esc(p.id) + '" data-check="' + esc(c.id) + '">View</button>' +
          '<button class="btn small primary" type="button" data-action="resolve" data-patient="' + esc(p.id) + '" data-check="' + esc(c.id) + '">Resolve</button>' +
        '</div></td>' +
      '</tr>';
    }).join("");
  }

  function renderDefectLog() {
    var rows = currentRows();
    var el = $("defect-log");
    $("defect-count").textContent = rows.length;
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state small"><strong>No open defects.</strong><p>Your role has no failed, partial or incomplete items right now.</p></div>';
      return;
    }
    el.innerHTML = rows.map(function (row) {
      var p = row.patient;
      var c = row.check;
      return '<button class="defect-item" type="button" data-action="view" data-patient="' + esc(p.id) + '" data-check="' + esc(c.id) + '">' +
        '<span class="defect-top">' + severityChip(c.severity) + '<span class="defect-date">' + esc(fmtDate(c.raisedAt || p.dischargeDate)) + '</span></span>' +
        '<span class="defect-title">' + esc(c.title) + '</span>' +
        '<span class="defect-patient">' + esc(p.name) + ' · ' + esc(p.id) + '</span>' +
        '<span class="defect-desc">' + esc(c.why) + '</span>' +
      '</button>';
    }).join("");
  }

  function metricBlock(label, value, note, ratio) {
    var width = ratio == null ? 0 : Math.max(0, Math.min(100, Math.round(ratio * 100)));
    return '<div class="metric-block">' +
      '<div class="metric-top"><span>' + esc(label) + '</span><strong>' + pct(value) + '</strong></div>' +
      '<div class="metric-bar" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + width + '"><span style="width:' + width + '%"></span></div>' +
      '<p class="metric-note">' + esc(note) + '</p>' +
    '</div>';
  }

  function renderMetrics() {
    var m = currentMetrics();
    $("metrics-summary").innerHTML =
      metricBlock("Accuracy", m.accuracy, m.passedChecks + " of " + m.totalChecks + " checks passed", m.accuracy) +
      metricBlock("Completeness", m.completeness, m.completeChecks + " of " + m.totalChecks + " checks have complete required fields", m.completeness) +
      metricBlock("Handoff Efficiency", m.handoffEfficiency,
        m.flaggedHandoffs ? m.resolvedChecks + " of " + m.flaggedHandoffs + " flagged handoffs resolved" : "No flagged handoffs for this role",
        m.handoffEfficiency);
  }

  function renderRecentlyResolved() {
    var resolved = DCMEngine.flatten(state.records, session.role).filter(function (item) {
      return !!item.check.resolution;
    }).sort(function (a, b) {
      return String(b.check.resolution.at).localeCompare(String(a.check.resolution.at));
    });

    var el = $("recently-resolved");
    if (!resolved.length) {
      el.innerHTML = '<div class="empty-state small"><strong>No items resolved yet.</strong><p>Resolve one of your open items to see it here.</p></div>';
      return;
    }

    el.innerHTML = resolved.map(function (item) {
      var p = item.patient;
      var c = item.check;
      return '<div class="resolved-item">' +
        '<div class="resolved-top">' + statusChip("Passed") + '<span class="resolved-patient">' + esc(p.name) + ' · ' + esc(p.id) + '</span></div>' +
        '<strong>' + esc(c.title) + '</strong>' +
        '<span class="resolved-meta">Resolved by ' + esc(c.resolution.by) + ' at ' + esc(fmtDateTime(c.resolution.at)) + '</span>' +
        '<p>' + esc(c.resolution.note) + '</p>' +
      '</div>';
    }).join("");
  }

  function renderNotifications() {
    var rows = roleOpenRows();
    $("notification-count").hidden = rows.length === 0;
    $("notification-count").textContent = rows.length;
    $("notification-summary").textContent = rows.length + (rows.length === 1 ? " item" : " items");
    var list = $("notification-list");
    if (!rows.length) {
      list.innerHTML = '<p class="notification-empty">No open items for your role.</p>';
      return;
    }
    list.innerHTML = rows.slice(0, 8).map(function (row) {
      return '<button class="notification-item" type="button" data-action="view" data-patient="' + esc(row.patient.id) + '" data-check="' + esc(row.check.id) + '">' +
        severityChip(row.check.severity) +
        '<span><strong>' + esc(row.check.title) + '</strong><small>' + esc(row.patient.name) + ' · ' + esc(row.patient.id) + '</small></span>' +
      '</button>';
    }).join("");
  }

  function renderDemoCases() {
    var el = $("demo-cases");
    var html = DCM_DEMOS.order.map(function (id) {
      var def = DCM_DEMOS.cases[id];
      var isActive = activeDemo && activeDemo.id === id;
      var completed = isActive && activeDemo.completed;
      var roleMatch = session.role === def.role;
      var label = isActive && !completed ? "Demo in progress" : isActive && completed ? "View result" : roleMatch ? "Start demo" : "Switch to " + def.role + " and start";
      var disabled = isActive && !completed ? " disabled" : "";
      return '<article class="demo-case' + (completed ? " is-complete" : "") + '">' +
        '<div class="demo-case-top"><span class="role-chip">' + esc(def.role) + '</span><span class="severity-chip sev-high">' + esc(def.severity) + '</span></div>' +
        '<h3>' + esc(def.title) + '</h3>' +
        '<p>' + esc(def.summary) + '</p>' +
        '<ol class="demo-steps">' + def.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join("") + '</ol>' +
        '<p class="demo-example">' + esc(def.example) + '</p>' +
        '<button class="btn small ' + (completed ? "ghost" : "primary") + '" type="button" data-demo-start="' + esc(id) + '"' + disabled + '>' + esc(label) + '</button>' +
      '</article>';
    }).join("");
    el.innerHTML = html;
  }

  function renderDemoCoach() {
    var el = $("demo-coach");
    if (!activeDemo) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    var def = DCM_DEMOS.cases[activeDemo.id];
    var done = activeDemo.completed;
    el.hidden = false;
    el.className = "demo-coach" + (done ? " is-complete" : "");
    var steps = def.steps.map(function (step, index) {
      var stepDone = done || (index === 0 && activeDemo.opened);
      return '<li class="' + (stepDone ? "done" : "") + '"><span aria-hidden="true">' + (stepDone ? "\u2713" : String(index + 1)) + '</span>' + esc(step) + '</li>';
    }).join("");

    el.innerHTML =
      '<div class="demo-coach-copy">' +
        '<p class="eyebrow">Guided demo · synthetic</p>' +
        '<h2>' + (done ? "Demo complete" : "Demo in progress") + ' - ' + esc(def.title) + '</h2>' +
        '<p>' + (done ? "The item is now Passed, the KPI cards and chart have updated, and the audit log recorded the change." : "Follow the steps. The system never pre-fills a clinical value - you type every value.") + '</p>' +
        '<ol class="coach-steps">' + steps + '</ol>' +
        '<p class="demo-example">' + esc(def.example) + '</p>' +
      '</div>' +
      '<div class="demo-coach-actions">' +
        (done ? '<button class="btn small primary" type="button" data-demo-audit>Open audit log</button>' : '<button class="btn small primary" type="button" data-demo-open>Open the item</button>') +
        '<button class="btn small ghost" type="button" data-demo-exit>Exit demo</button>' +
      '</div>';
  }

  function renderAudit() {
    var events = visibleAudit();
    $("audit-count").textContent = events.length + (events.length === 1 ? " event" : " events");
    var body = $("audit-body");
    if (!events.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty-state small"><strong>No audit events for your role yet.</strong></div></td></tr>';
      return;
    }
    body.innerHTML = events.map(function (event) {
      return '<tr>' +
        '<td class="nowrap">' + esc(fmtDateTime(event.timestamp)) + '</td>' +
        '<td><span class="event-chip event-' + esc(String(event.event_type).replace(/_/g, "-")) + '">' + esc(EVENT_LABEL[event.event_type] || event.event_type) + '</span></td>' +
        '<td>' + esc(event.patient_id) + '</td>' +
        '<td>' + esc(event.actor_id) + '</td>' +
        '<td>' + esc(event.role) + '</td>' +
        '<td>' + esc(event.rule_id) + '</td>' +
        '<td class="nowrap">' + esc(event.before) + ' &rarr; ' + esc(event.after) + '</td>' +
        '<td>' + esc(event.reason_code) + '</td>' +
      '</tr>';
    }).join("");
  }

  function renderSettings() {
    var m = currentMetrics();
    var demoCase = activeDemo ? DCM_DEMOS.cases[activeDemo.id] : null;
    $("settings-content").innerHTML =
      '<article class="settings-card">' +
        '<h3>Signed-in account</h3>' +
        '<dl class="detail-list">' +
          '<div><dt>Name</dt><dd>' + esc(session.name) + '</dd></div>' +
          '<div><dt>Role</dt><dd>' + esc(session.role) + '</dd></div>' +
          '<div><dt>Staff ID</dt><dd>' + esc(session.staffId) + '</dd></div>' +
          '<div><dt>Session expires</dt><dd>' + esc(fmtDateTime(new Date(session.expiresAt).toISOString())) + '</dd></div>' +
        '</dl>' +
      '</article>' +
      '<article class="settings-card">' +
        '<h3>Run information</h3>' +
        '<dl class="detail-list">' +
          '<div><dt>Run</dt><dd>' + esc(DCM_SEED.runLabel) + '</dd></div>' +
          '<div><dt>Prompt version</dt><dd>' + esc(DCM_SEED.promptVersion) + '</dd></div>' +
          '<div><dt>Audit period</dt><dd>' + esc(DCM_SEED.auditPeriod) + '</dd></div>' +
          '<div><dt>Status</dt><dd>' + esc(DCM_SEED.runStatus) + '</dd></div>' +
          '<div><dt>Your open items</dt><dd>' + m.openChecks + '</dd></div>' +
        '</dl>' +
      '</article>' +
      '<article class="settings-card">' +
        '<h3>Role privacy</h3>' +
        '<p>The data layer filters by the signed-in role. Pipeline rows, defect log, KPIs, chart, metrics, search, notifications and export only receive your role\'s items. Other roles\' items cannot be opened by search or by calling the detail action.</p>' +
        '<p class="settings-note"><span class="synthetic-badge">Synthetic data</span> Prototype only. No real patients.</p>' +
      '</article>' +
      '<article class="settings-card">' +
        '<h3>Demo</h3>' +
        '<p>' + (demoCase ? 'Active demo: ' + esc(demoCase.title) + (activeDemo.completed ? ' (complete).' : ' (in progress).') : 'No demo is running.') + '</p>' +
        '<div class="settings-actions">' +
          '<button class="btn small primary" type="button" data-settings-action="demo-doctor">Doctor demo</button>' +
          '<button class="btn small ghost" type="button" data-settings-action="demo-nurse">Nurse demo</button>' +
          '<button class="btn small ghost danger" type="button" data-settings-action="reset">Reset demo data</button>' +
        '</div>' +
        '<p class="settings-note">Reset restores the seeded patients and clears audit events. It does not sign you out.</p>' +
      '</article>' +
      '<article class="settings-card settings-card-wide">' +
        '<h3>Production notes</h3>' +
        '<p>This prototype uses a local demo login. Production requires hospital SSO + MFA, password policy, account provisioning, encryption and real audit storage. The system never approves a discharge; a human clinician signs off.</p>' +
      '</article>';
  }

  function findVisibleCheck(patientId, checkId) {
    return DCMEngine.findCheck(state.records, session.role, patientId, checkId);
  }

  function openDrawer(mode, patientId, checkId, trigger) {
    if (!session) return;
    var hit = findVisibleCheck(patientId, checkId);
    if (!hit) {
      toast("This item is not available for your role.");
      return;
    }
    var patient = hit.patient;
    var check = hit.check;

    if (mode === "resolve" && !DCMEngine.isOpen(check)) {
      mode = "view";
      toast("This item is already resolved.");
    }

    if (activeDemo) {
      var def = DCM_DEMOS.cases[activeDemo.id];
      if (def && def.patientId === patientId && def.checkId === checkId) activeDemo.opened = true;
    }

    activeDrawer = { mode: mode, patientId: patientId, checkId: checkId, trigger: trigger || document.activeElement };
    lastFocused = activeDrawer.trigger;

    addAudit(mode === "resolve" ? "edit" : "view", patient.id, patient.encounterId, check.id, check.status, check.status,
      mode === "resolve" ? "opened_edit_form" : "opened_detail_panel");

    $("drawer-eyebrow").textContent = mode === "resolve" ? "Resolve workflow" : "Defect detail";
    $("drawer-title").textContent = mode === "resolve" ? "Resolve this item" : check.title;
    $("drawer-body").innerHTML = mode === "resolve" ? buildResolveBody(patient, check) : buildViewBody(patient, check);

    $("drawer-overlay").hidden = false;
    $("drawer").hidden = false;
    document.body.classList.add("drawer-open");
    renderDemoCoach();

    window.setTimeout(function () {
      var target = mode === "resolve" ? $("drawer-body").querySelector("input, select, textarea") : $("drawer-close");
      if (target) target.focus();
    }, 30);
  }

  function closeDrawer(restoreFocus) {
    var trigger = activeDrawer && activeDrawer.trigger;
    $("drawer").hidden = true;
    $("drawer-overlay").hidden = true;
    $("drawer-body").innerHTML = "";
    document.body.classList.remove("drawer-open");
    activeDrawer = null;
    if (restoreFocus && trigger && document.body.contains(trigger)) trigger.focus();
    if (session) renderDemoCoach();
  }

  function patientSummary(patient) {
    return '<section class="drawer-section patient-card">' +
      '<div class="patient-card-head"><div><span class="patient-id">' + esc(patient.id) + '</span><h3>' + esc(patient.name) + '</h3></div></div>' +
      '<dl class="detail-list compact">' +
        '<div><dt>Encounter</dt><dd>' + esc(patient.encounterId) + '</dd></div>' +
        '<div><dt>Department</dt><dd>' + esc(patient.department) + '</dd></div>' +
        '<div><dt>Admitted</dt><dd>' + esc(fmtDate(patient.admissionDate)) + '</dd></div>' +
        '<div><dt>Discharged</dt><dd>' + esc(fmtDate(patient.dischargeDate)) + '</dd></div>' +
        '<div><dt>Language</dt><dd>' + esc(patient.preferredLanguage) + '</dd></div>' +
      '</dl>' +
    '</section>';
  }

  function defectBlock(check) {
    return '<section class="drawer-section">' +
      '<div class="drawer-section-head"><h3>Defect</h3>' + severityChip(check.severity) + '</div>' +
      '<div class="detail-chips">' + handoffChip(check.handoffStatus) + statusChip(check.status) + '<span class="rule-chip">' + esc(check.id) + '</span></div>' +
      '<p class="drawer-defect-title">' + esc(check.title) + '</p>' +
      '<p class="drawer-defect-why">' + esc(check.why) + '</p>' +
      '<div class="evidence-box"><span>Evidence</span><p>' + esc(check.evidence) + '</p></div>' +
      '<p class="role-note">Owner: <strong>' + esc(check.owner) + '</strong>. Only the ' + esc(check.owner) + ' role can resolve this item.</p>' +
    '</section>';
  }

  function buildViewBody(patient, check) {
    var body = patientSummary(patient) + defectBlock(check);
    if (check.resolution) {
      body += '<section class="drawer-section resolution-box">' +
        '<h3>Resolution</h3>' +
        '<p><strong>' + esc(check.resolution.by) + '</strong> resolved this item at ' + esc(fmtDateTime(check.resolution.at)) + '.</p>' +
        '<p>' + esc(check.resolution.note) + '</p>' +
        '<dl class="detail-list compact">' + Object.keys(check.resolution.values || {}).map(function (key) {
          return '<div><dt>' + esc(key) + '</dt><dd>' + esc(check.resolution.values[key]) + '</dd></div>';
        }).join("") + '</dl>' +
      '</section>';
    }

    var trail = state.audit.filter(function (event) {
      return event.patient_id === patient.id && event.rule_id === check.id;
    }).slice(-8).reverse();
    body += '<section class="drawer-section">' +
      '<h3>Audit trail</h3>' +
      (trail.length ? '<ul class="mini-audit">' + trail.map(function (event) {
        return '<li><strong>' + esc(EVENT_LABEL[event.event_type] || event.event_type) + '</strong> ' + esc(fmtDateTime(event.timestamp)) + '<span>' + esc(event.before) + ' &rarr; ' + esc(event.after) + (event.reason_code && event.reason_code !== "-" ? ' · ' + esc(event.reason_code) : '') + '</span></li>';
      }).join("") + '</ul>' : '<p class="empty-note">No events recorded for this item yet.</p>') +
    '</section>';

    body += '<div class="drawer-actions">' +
      '<button class="btn ghost" type="button" id="drawer-cancel">Close</button>' +
      (DCMEngine.isOpen(check) ? '<button class="btn primary" type="button" data-action="resolve" data-patient="' + esc(patient.id) + '" data-check="' + esc(check.id) + '">Resolve this item</button>' : '') +
    '</div>';
    return body;
  }

  function fieldControl(field, patient, showExample) {
    var id = "field-" + field.name;
    var input = "";
    if (field.type === "select") {
      input = '<select id="' + id + '" name="' + esc(field.name) + '" aria-required="' + (field.required ? "true" : "false") + '" aria-describedby="' + id + '-error">' +
        '<option value="">Select...</option>' +
        (field.options || []).map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + '</option>'; }).join("") +
      '</select>';
    } else if (field.type === "textarea") {
      input = '<textarea id="' + id + '" name="' + esc(field.name) + '" rows="3" placeholder="' + esc(field.placeholder || "") + '" aria-required="' + (field.required ? "true" : "false") + '" aria-describedby="' + id + '-error"></textarea>';
    } else {
      var extra = "";
      if (field.type === "date" && field.rule === "afterDischarge") extra = ' min="' + esc(nextDay(patient.dischargeDate)) + '"';
      input = '<input id="' + id + '" name="' + esc(field.name) + '" type="' + esc(field.type || "text") + '" placeholder="' + esc(field.placeholder || "") + '"' + extra + ' aria-required="' + (field.required ? "true" : "false") + '" aria-describedby="' + id + '-error" />';
    }
    return '<div class="form-field" data-field-wrap="' + esc(field.name) + '">' +
      '<label for="' + id + '">' + esc(field.label) + (field.required ? ' <span class="required-mark">*</span>' : '') + '</label>' +
      input +
      (showExample && field.example ? '<span class="field-hint">Demo example: ' + esc(field.example) + '</span>' : '') +
      '<p class="field-error" id="' + id + '-error" data-error-for="' + esc(field.name) + '" hidden></p>' +
    '</div>';
  }

  function buildResolveBody(patient, check) {
    var inDemo = activeDemo && DCM_DEMOS.cases[activeDemo.id] && DCM_DEMOS.cases[activeDemo.id].patientId === patient.id && DCM_DEMOS.cases[activeDemo.id].checkId === check.id;
    return patientSummary(patient) + defectBlock(check) +
      '<form id="resolve-form" novalidate>' +
        '<p class="form-alert" id="resolve-form-error" role="alert" hidden></p>' +
        '<section class="drawer-section">' +
          '<div class="drawer-section-head"><h3>Complete the missing information</h3><span class="role-chip">' + esc(check.owner) + '</span></div>' +
          '<p class="form-intro">Your entry re-runs the check. If the data is not valid, the item stays open and the reason is shown.</p>' +
          check.fields.map(function (field) { return fieldControl(field, patient, inDemo); }).join("") +
        '</section>' +
        '<div class="drawer-actions">' +
          '<button class="btn ghost" type="button" id="drawer-cancel">Cancel</button>' +
          '<button class="btn primary" type="submit">Save resolution</button>' +
        '</div>' +
      '</form>';
  }

  function renderFormErrors(form, errors) {
    var all = form.querySelectorAll(".field-error");
    for (var i = 0; i < all.length; i += 1) {
      all[i].textContent = "";
      all[i].hidden = true;
    }
    var wraps = form.querySelectorAll(".form-field");
    for (var j = 0; j < wraps.length; j += 1) wraps[j].classList.remove("has-error");

    var firstKey = null;
    Object.keys(errors || {}).forEach(function (key) {
      if (key === "_form") return;
      if (!firstKey) firstKey = key;
      var error = form.querySelector('[data-error-for="' + key + '"]');
      var wrap = form.querySelector('[data-field-wrap="' + key + '"]');
      if (error) {
        error.textContent = errors[key];
        error.hidden = false;
      }
      if (wrap) wrap.classList.add("has-error");
    });

    var formError = $("resolve-form-error");
    if (errors && errors._form) {
      formError.textContent = errors._form;
      formError.hidden = false;
    } else {
      formError.hidden = true;
    }

    if (firstKey) {
      var input = form.elements[firstKey];
      if (input) input.focus();
    }
  }

  function handleResolveSubmit(event) {
    var form = event.target;
    if (!form || form.id !== "resolve-form") return;
    event.preventDefault();
    if (!activeDrawer) return;

    var hit = findVisibleCheck(activeDrawer.patientId, activeDrawer.checkId);
    if (!hit) {
      toast("This item is not available for your role.");
      return;
    }

    var values = {};
    (hit.check.fields || []).forEach(function (field) {
      var input = form.elements[field.name];
      values[field.name] = input ? input.value : "";
    });

    var result = DCMEngine.resolveCheck(hit.patient, hit.check, values, session, new Date().toISOString());
    if (!result.ok) {
      if (result.unauthorized) {
        toast("Only the " + hit.check.owner + " role can resolve this item.");
        return;
      }
      renderFormErrors(form, result.errors);
      return;
    }

    addAudit("resolve", hit.patient.id, hit.patient.encounterId, hit.check.id, result.before, "Passed", result.note);
    addAudit("recheck", hit.patient.id, hit.patient.encounterId, hit.check.id, "Passed", "Passed", "re-check passed after resolution");

    if (activeDemo) {
      var def = DCM_DEMOS.cases[activeDemo.id];
      if (def && def.patientId === hit.patient.id && def.checkId === hit.check.id) {
        activeDemo.completed = true;
        activeDemo.completedAt = new Date().toISOString();
      }
    }

    save();
    closeDrawer(false);
    renderAll();
    toast("Resolved: " + hit.patient.name + " - " + hit.check.title + ". Status is now Passed.");
  }

  function renderNotificationsOpen(open) {
    $("notification-menu").hidden = !open;
    $("notification-btn").setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeNotifications() {
    renderNotificationsOpen(false);
  }

  function openSidebar() {
    document.body.classList.add("sidebar-open");
    $("sidebar-backdrop").hidden = false;
    $("menu-btn").setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.body.classList.remove("sidebar-open");
    $("sidebar-backdrop").hidden = true;
    $("menu-btn").setAttribute("aria-expanded", "false");
  }

  function startDemo(caseId) {
    var def = DCM_DEMOS.cases[caseId];
    if (!def) return;
    var user = DCMAuth.findUser(def.accountName);
    if (!user) {
      toast("Demo account not found.");
      return;
    }

    if (!session || session.role !== def.role) {
      if (session) signOut("demo_switch");
      var result = DCMAuth.authenticate({ name: user.name, password: user.password });
      if (!result.ok) {
        showLogin("The demo account could not sign in.", "error");
        return;
      }
      completeLogin(result.user, result.session, true);
    }

    var hit = findVisibleCheck(def.patientId, def.checkId);
    if (!hit || !DCMEngine.isOpen(hit.check)) {
      activeDemo = { id: caseId, opened: true, completed: true, completedAt: new Date().toISOString() };
      currentView = "audit-center";
      renderAll();
      openDrawer("view", def.patientId, def.checkId, $("run-demo-btn"));
      toast("This demo case is already resolved. Reset demo data to replay it.");
      return;
    }

    activeDemo = { id: caseId, opened: false, completed: false };
    currentView = "audit-center";
    renderAll();
    toast("Demo started: " + def.title + ".");
    openDrawer("resolve", def.patientId, def.checkId, $("run-demo-btn"));
  }

  function exitDemo() {
    activeDemo = null;
    renderDemoCases();
    renderDemoCoach();
    toast("Demo exited. Your changes are saved.");
  }

  function resetDemo() {
    if (!window.confirm("Reset the prototype to the seeded patients and clear all audit events? This does not sign you out.")) return;
    state = freshState();
    save();
    activeDemo = null;
    closeDrawer(false);
    filters.search = "";
    filters.severity = "All";
    $("search-input").value = "";
    $("severity-filter").value = "All";
    renderAll();
    toast("Demo data reset to the seeded state.");
  }

  function csvCell(value) {
    var text = String(value == null ? "" : value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function exportCsv() {
    var rows = currentRows();
    if (!rows.length) {
      toast("No open items for your role to export.");
      return;
    }
    var lines = [["Patient ID", "Name", "Encounter", "AI Agent Handoff Status", "Defect Check", "Severity", "Defect", "Why", "Owner"].join(",")];
    rows.forEach(function (row) {
      lines.push([
        row.patient.id,
        row.patient.name,
        row.patient.encounterId,
        row.check.handoffStatus,
        row.check.status,
        row.check.severity,
        row.check.title,
        row.check.why,
        row.check.owner
      ].map(csvCell).join(","));
    });
    addAudit("export", "-", "-", "-", "-", rows.length + " items", "role_scoped_export");
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "discharge-audit-" + session.role.toLowerCase() + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    renderNotifications();
    toast("Exported " + rows.length + " role-scoped items.");
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !activeDrawer) return;
    var drawer = $("drawer");
    var focusable = drawer.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindLogin() {
    $("login-form").addEventListener("submit", handleLogin);
    $("login-name").addEventListener("input", function () {
      setFieldError("login-name", "");
      updateLoginButton();
    });
    $("login-password").addEventListener("input", function () {
      setFieldError("login-password", "");
      updateLoginButton();
    });
    $("password-toggle").addEventListener("click", function () {
      var input = $("login-password");
      var showing = input.type === "text";
      input.type = showing ? "password" : "text";
      this.textContent = showing ? "Show" : "Hide";
      this.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      this.setAttribute("aria-pressed", showing ? "false" : "true");
    });
  }

  function bindApp() {
    $("menu-btn").addEventListener("click", function () {
      if (document.body.classList.contains("sidebar-open")) closeSidebar(); else openSidebar();
    });
    $("sidebar-backdrop").addEventListener("click", closeSidebar);

    $("search-input").addEventListener("input", function () {
      filters.search = this.value;
      renderPipeline();
      renderDefectLog();
    });

    $("severity-filter").addEventListener("change", function () {
      filters.severity = this.value;
      renderPipeline();
      renderDefectLog();
    });

    $("notification-btn").addEventListener("click", function (event) {
      event.stopPropagation();
      renderNotificationsOpen($("notification-menu").hidden);
    });

    $("signout-btn").addEventListener("click", function () { signOut("manual"); });
    $("export-btn").addEventListener("click", exportCsv);
    $("run-demo-btn").addEventListener("click", function () {
      if (session.role === "Doctor") {
        startDemo("doctor");
      } else if (session.role === "Nurse") {
        startDemo("nurse");
      } else {
        setView("audit-center");
        var panel = $("demo-panel");
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
        toast("Choose a demo case below.");
      }
    });

    $("drawer-close").addEventListener("click", function () { closeDrawer(true); });
    $("drawer-overlay").addEventListener("click", function () { closeDrawer(true); });
    $("drawer-body").addEventListener("submit", handleResolveSubmit);

    $("stay-signed-in").addEventListener("click", function () {
      DCMAuth.touchSession(session);
      warningShown = false;
      lastTouch = Date.now();
      $("session-warning").hidden = true;
      toast("Session extended.");
    });
    $("session-signout").addEventListener("click", function () { signOut("manual"); });

    document.addEventListener("pointerdown", activityPulse);
    document.addEventListener("keydown", activityPulse);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (activeDrawer) {
          closeDrawer(true);
        } else {
          closeNotifications();
          closeSidebar();
        }
      }
      trapFocus(event);
    });

    document.addEventListener("click", function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      var navBtn = target.closest("[data-view]");
      if (navBtn) {
        setView(navBtn.getAttribute("data-view"));
        return;
      }

      var actionBtn = target.closest("[data-action]");
      if (actionBtn) {
        var action = actionBtn.getAttribute("data-action");
        var patientId = actionBtn.getAttribute("data-patient");
        var checkId = actionBtn.getAttribute("data-check");
        closeNotifications();
        if (action === "resolve") openDrawer("resolve", patientId, checkId, actionBtn);
        else openDrawer("view", patientId, checkId, actionBtn);
        return;
      }

      var demoStart = target.closest("[data-demo-start]");
      if (demoStart) {
        startDemo(demoStart.getAttribute("data-demo-start"));
        return;
      }

      var loginDemo = target.closest("[data-demo]");
      if (loginDemo) {
        startDemo(loginDemo.getAttribute("data-demo"));
        return;
      }

      var settingsAction = target.closest("[data-settings-action]");
      if (settingsAction) {
        var name = settingsAction.getAttribute("data-settings-action");
        if (name === "reset") resetDemo();
        else if (name === "demo-doctor") startDemo("doctor");
        else if (name === "demo-nurse") startDemo("nurse");
        return;
      }

      if (target.closest("[data-demo-audit]")) {
        currentView = "audit-log";
        renderAll();
        window.scrollTo(0, 0);
        return;
      }

      if (target.closest("[data-demo-open]")) {
        var def = activeDemo ? DCM_DEMOS.cases[activeDemo.id] : null;
        if (def) openDrawer("resolve", def.patientId, def.checkId, $("run-demo-btn"));
        return;
      }

      if (target.closest("[data-demo-exit]")) {
        exitDemo();
        return;
      }

      if (target.closest("#drawer-cancel")) {
        closeDrawer(true);
        return;
      }

      if (!target.closest(".notification-wrap")) closeNotifications();
    });
  }

  function boot() {
    bindLogin();
    bindApp();
    state = loadState();

    var restored = DCMAuth.loadSession();
    if (restored) {
      session = restored;
      showApp();
      renderAll();
      startSessionClock();
    } else {
      showLogin();
    }
  }

  boot();
})();
