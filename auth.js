var DCMAuth = (function () {
  "use strict";

  var SESSION_KEY = "dcm_session_v4";
  var ATTEMPTS_KEY = "dcm_login_attempts_v4";
  var SESSION_MS = 15 * 60 * 1000;
  var WARNING_MS = 60 * 1000;
  var LOCK_MS = 5 * 60 * 1000;
  var MAX_ATTEMPTS = 5;

  var memoryStore = {};

  var DEMO_USERS = [
    { staffId: "DOC-1001", name: "Dr. Niamh O'Sullivan", role: "Doctor", title: "Attending Physician", password: "DemoDoctor!2026" },
    { staffId: "NUR-2001", name: "Aoife Kelly", role: "Nurse", title: "Discharge / Charge Nurse", password: "DemoNurse!2026" },
    { staffId: "PHA-3001", name: "Ciarán Murphy", role: "Pharmacist", title: "Clinical Pharmacist", password: "DemoPharm!2026" }
  ];

  function storage() {
    try {
      if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    } catch (e) {}
    return null;
  }

  function readRaw(key) {
    var store = storage();
    if (store) {
      try { return store.getItem(key); } catch (e) {}
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function writeRaw(key, value) {
    var store = storage();
    if (store) {
      try { store.setItem(key, value); return; } catch (e) {}
    }
    memoryStore[key] = value;
  }

  function removeRaw(key) {
    var store = storage();
    if (store) {
      try { store.removeItem(key); return; } catch (e) {}
    }
    delete memoryStore[key];
  }

  function norm(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readAttempts() {
    try {
      var raw = readRaw(ATTEMPTS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeAttempts(data) {
    writeRaw(ATTEMPTS_KEY, JSON.stringify(data));
  }

  function findUser(nameOrId) {
    var key = norm(nameOrId);
    if (!key) return null;
    for (var i = 0; i < DEMO_USERS.length; i += 1) {
      if (norm(DEMO_USERS[i].name) === key || norm(DEMO_USERS[i].staffId) === key) return DEMO_USERS[i];
    }
    return null;
  }

  function userForRole(role) {
    for (var i = 0; i < DEMO_USERS.length; i += 1) {
      if (DEMO_USERS[i].role === role) return DEMO_USERS[i];
    }
    return null;
  }

  function lockState(nameOrId) {
    var key = norm(nameOrId);
    if (!key) return null;
    var attempts = readAttempts();
    var entry = attempts[key];
    if (!entry || !entry.lockedUntil) return null;
    if (entry.lockedUntil <= Date.now()) {
      delete attempts[key];
      writeAttempts(attempts);
      return null;
    }
    return { lockedUntil: entry.lockedUntil, remainingMs: entry.lockedUntil - Date.now() };
  }

  function recordFailure(nameOrId) {
    var key = norm(nameOrId) || "unknown";
    var attempts = readAttempts();
    var entry = attempts[key] || { count: 0 };
    entry.count += 1;
    if (entry.count >= MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCK_MS;
      entry.count = 0;
    }
    entry.lastFailedAt = new Date().toISOString();
    attempts[key] = entry;
    writeAttempts(attempts);
    return entry.lockedUntil ? { lockedUntil: entry.lockedUntil, remainingMs: entry.lockedUntil - Date.now() } : null;
  }

  function clearFailures(nameOrId) {
    var key = norm(nameOrId);
    if (!key) return;
    var attempts = readAttempts();
    if (attempts[key]) {
      delete attempts[key];
      writeAttempts(attempts);
    }
  }

  function authenticate(input) {
    var name = input && input.name;
    var password = input && input.password;
    var locked = lockState(name);
    if (locked) return { ok: false, reason: "locked", lock: locked };

    var user = findUser(name);
    if (!user || user.password !== password) {
      var failureLock = recordFailure(name);
      return { ok: false, reason: failureLock ? "locked" : "invalid", lock: failureLock || null };
    }

    clearFailures(name);
    var now = Date.now();
    return {
      ok: true,
      user: clone(user),
      session: {
        userId: user.staffId,
        name: user.name,
        role: user.role,
        staffId: user.staffId,
        title: user.title,
        startedAt: new Date(now).toISOString(),
        lastActivityAt: new Date(now).toISOString(),
        expiresAt: now + SESSION_MS
      }
    };
  }

  function saveSession(session) {
    writeRaw(SESSION_KEY, JSON.stringify(session));
  }

  function loadSession() {
    try {
      var raw = readRaw(SESSION_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (!session || !session.userId || !session.expiresAt || session.expiresAt <= Date.now()) {
        removeRaw(SESSION_KEY);
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function touchSession(session) {
    if (!session) return null;
    var now = Date.now();
    session.lastActivityAt = new Date(now).toISOString();
    session.expiresAt = now + SESSION_MS;
    saveSession(session);
    return session;
  }

  function clearSession() {
    removeRaw(SESSION_KEY);
  }

  function remainingMs(session) {
    return session && session.expiresAt ? Math.max(0, session.expiresAt - Date.now()) : 0;
  }

  return {
    SESSION_KEY: SESSION_KEY,
    SESSION_MS: SESSION_MS,
    WARNING_MS: WARNING_MS,
    LOCK_MS: LOCK_MS,
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    DEMO_USERS: DEMO_USERS,
    authenticate: authenticate,
    findUser: findUser,
    userForRole: userForRole,
    saveSession: saveSession,
    loadSession: loadSession,
    touchSession: touchSession,
    clearSession: clearSession,
    remainingMs: remainingMs,
    lockState: lockState,
    clearFailures: clearFailures
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DCMAuth;
}
