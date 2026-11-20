var assert = require("assert");
var data = require("./data.js");
var engine = require("./engine.js");
var auth = require("./auth.js");

var seed = data.seed;
var demos = data.demos;
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS  " + name);
  } catch (error) {
    failed += 1;
    console.error("FAIL  " + name);
    console.error("      " + error.message);
  }
}

function cloneRecords() {
  return JSON.parse(JSON.stringify(seed.patients));
}

function resolveValues(patientId, checkId) {
  var records = cloneRecords();
  var hit = engine.findCheck(records, "Doctor", patientId, checkId);
  return { records: records, patient: hit.patient, check: hit.check };
}

test("Seed has ten synthetic patients with unique check ids per patient", function () {
  assert.strictEqual(seed.patients.length, 10);
  seed.patients.forEach(function (patient) {
    var ids = {};
    patient.checks.forEach(function (check) {
      assert.ok(check.id, "check id missing for " + patient.id);
      assert.ok(check.owner, "owner missing for " + patient.id + " " + check.id);
      assert.ok(!ids[check.id], "duplicate check " + check.id + " for " + patient.id);
      ids[check.id] = true;
    });
  });
});

test("Demo cases point to open checks owned by the correct role", function () {
  demos.order.forEach(function (id) {
    var demo = demos.cases[id];
    var records = cloneRecords();
    var hit = engine.findCheck(records, demo.role, demo.patientId, demo.checkId);
    assert.ok(hit, "demo check not found: " + id);
    assert.ok(engine.isOpen(hit.check), "demo check is not open: " + id);
    assert.strictEqual(hit.patient.name, demo.patientName);
  });
});

test("Doctor filter returns only doctor-owned open items", function () {
  var rows = engine.filterByRole(cloneRecords(), "Doctor");
  assert.ok(rows.length > 0);
  rows.forEach(function (row) {
    assert.strictEqual(row.check.owner, "Doctor");
    assert.ok(engine.isOpen(row.check));
  });
  var ids = rows.map(function (row) { return row.patient.id; });
  assert.strictEqual(ids.indexOf("P105"), -1, "doctor must not see nurse P105");
  assert.strictEqual(ids.indexOf("P107"), -1, "doctor must not see pharmacist P107");
  assert.ok(ids.indexOf("P102") !== -1, "doctor must see P102");
});

test("Nurse filter hides the doctor Patient 102 item", function () {
  var rows = engine.filterByRole(cloneRecords(), "Nurse");
  rows.forEach(function (row) { assert.strictEqual(row.check.owner, "Nurse"); });
  var ids = rows.map(function (row) { return row.patient.id; });
  assert.strictEqual(ids.indexOf("P102"), -1, "nurse must not see doctor P102");
  assert.strictEqual(ids.indexOf("P107"), -1, "nurse must not see pharmacist P107");
  assert.ok(ids.indexOf("P105") !== -1, "nurse must see P105");
  assert.strictEqual(engine.filterByRole(cloneRecords(), "Nurse", { search: "Sophia" }).length, 0);
  assert.strictEqual(engine.filterByRole(cloneRecords(), "Doctor", { search: "Sophia" }).length, 1);
});

test("Pharmacist filter returns only pharmacist-owned open items", function () {
  var rows = engine.filterByRole(cloneRecords(), "Pharmacist");
  rows.forEach(function (row) { assert.strictEqual(row.check.owner, "Pharmacist"); });
  var ids = rows.map(function (row) { return row.patient.id; });
  assert.ok(ids.indexOf("P107") !== -1);
  assert.ok(ids.indexOf("P108") !== -1);
  assert.strictEqual(ids.indexOf("P105"), -1);
  assert.strictEqual(ids.indexOf("P102"), -1);
});

test("Severity filter applies to role-scoped rows", function () {
  var rows = engine.filterByRole(cloneRecords(), "Nurse", { severity: "High" });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].patient.id, "P105");
});

test("Doctor metrics are computed from real role data", function () {
  var m = engine.computeMetrics(cloneRecords(), "Doctor");
  assert.strictEqual(m.totalPatients, 5);
  assert.strictEqual(m.flaggedPatients, 4);
  assert.strictEqual(m.totalChecks, 7);
  assert.strictEqual(m.passedChecks, 3);
  assert.strictEqual(m.openChecks, 4);
  assert.strictEqual(m.defectRate, 4 / 5);
  assert.strictEqual(m.accuracy, 3 / 7);
  assert.strictEqual(m.completeness, 3 / 7);
  assert.strictEqual(m.handoffEfficiency, 0);
});

test("Nurse metrics are computed from real role data", function () {
  var m = engine.computeMetrics(cloneRecords(), "Nurse");
  assert.strictEqual(m.totalPatients, 5);
  assert.strictEqual(m.flaggedPatients, 3);
  assert.strictEqual(m.totalChecks, 5);
  assert.strictEqual(m.passedChecks, 2);
  assert.strictEqual(m.openChecks, 3);
  assert.strictEqual(m.accuracy, 2 / 5);
  assert.strictEqual(m.completeness, 2 / 5);
});

test("Pharmacist metrics count complete-but-wrong fields separately from accuracy", function () {
  var m = engine.computeMetrics(cloneRecords(), "Pharmacist");
  assert.strictEqual(m.totalPatients, 5);
  assert.strictEqual(m.flaggedPatients, 2);
  assert.strictEqual(m.totalChecks, 5);
  assert.strictEqual(m.passedChecks, 3);
  assert.strictEqual(m.openChecks, 2);
  assert.strictEqual(m.accuracy, 3 / 5);
  assert.strictEqual(m.completeness, 1);
});

test("PCP resolution rejects the discharge date and invalid values", function () {
  var ctx = resolveValues("P102", "C3");
  var result = engine.resolveCheck(ctx.patient, ctx.check, {
    pcpName: "Dr. R. Patel",
    appointmentDate: "2026-11-18",
    appointmentTime: "10:30",
    doctorNote: "Booked."
  }, { name: "Dr. Niamh O'Sullivan", role: "Doctor", staffId: "DOC-1001" }, "2026-11-19T09:00:00.000Z");
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.appointmentDate);

  var result2 = engine.resolveCheck(ctx.patient, ctx.check, {
    pcpName: "Dr. R. Patel",
    appointmentDate: "2026-02-30",
    appointmentTime: "25:00",
    doctorNote: "Booked."
  }, { name: "Dr. Niamh O'Sullivan", role: "Doctor", staffId: "DOC-1001" }, "2026-11-19T09:00:00.000Z");
  assert.strictEqual(result2.ok, false);
  assert.ok(result2.errors.appointmentDate);
  assert.ok(result2.errors.appointmentTime);
  assert.ok(engine.isOpen(ctx.check));
});

test("Doctor PCP resolution passes the check and updates metrics", function () {
  var records = cloneRecords();
  var hit = engine.findCheck(records, "Doctor", "P102", "C3");
  var result = engine.resolveCheck(hit.patient, hit.check, {
    pcpName: "Dr. R. Patel",
    appointmentDate: "2026-12-02",
    appointmentTime: "10:30",
    doctorNote: "PCP office confirmed the appointment."
  }, { name: "Dr. Niamh O'Sullivan", role: "Doctor", staffId: "DOC-1001" }, "2026-11-19T09:00:00.000Z");

  assert.strictEqual(result.ok, true);
  assert.strictEqual(hit.check.status, "Passed");
  assert.strictEqual(hit.check.handoffStatus, "Completed");
  assert.strictEqual(hit.check.resolution.by, "Dr. Niamh O'Sullivan");
  assert.strictEqual(hit.check.resolution.values.pcpName, "Dr. R. Patel");

  var m = engine.computeMetrics(records, "Doctor");
  assert.strictEqual(m.flaggedPatients, 3);
  assert.strictEqual(m.passedChecks, 4);
  assert.strictEqual(m.accuracy, 4 / 7);
  assert.strictEqual(m.handoffEfficiency, 1 / 4);
  assert.strictEqual(engine.filterByRole(records, "Doctor").length, 3);
});

test("Nurse teach-back demo resolves and updates nurse metrics", function () {
  var records = cloneRecords();
  var hit = engine.findCheck(records, "Nurse", "P105", "S4");
  var result = engine.resolveCheck(hit.patient, hit.check, {
    teachBackDone: "Yes",
    language: "Russian",
    interpreterUsed: "Yes",
    nurseNote: "Teach-back completed with interpreter."
  }, { name: "Aoife Kelly", role: "Nurse", staffId: "NUR-2001" }, "2026-11-19T09:00:00.000Z");

  assert.strictEqual(result.ok, true);
  assert.strictEqual(hit.check.status, "Passed");
  var m = engine.computeMetrics(records, "Nurse");
  assert.strictEqual(m.flaggedPatients, 2);
  assert.strictEqual(m.passedChecks, 3);
  assert.strictEqual(m.accuracy, 3 / 5);
  assert.strictEqual(m.handoffEfficiency, 1 / 3);
});

test("Role boundaries reject cross-role edits and lookups", function () {
  var records = cloneRecords();
  var doctorP102 = engine.findCheck(records, "Doctor", "P102", "C3");
  var nurseAttempt = engine.resolveCheck(doctorP102.patient, doctorP102.check, {
    pcpName: "Dr. R. Patel",
    appointmentDate: "2026-12-02",
    appointmentTime: "10:30",
    doctorNote: "Not mine."
  }, { name: "Aoife Kelly", role: "Nurse", staffId: "NUR-2001" }, "2026-11-19T09:00:00.000Z");
  assert.strictEqual(nurseAttempt.ok, false);
  assert.strictEqual(nurseAttempt.unauthorized, true);
  assert.ok(engine.isOpen(doctorP102.check));

  assert.strictEqual(engine.findCheck(records, "Nurse", "P102", "C3"), null);
  assert.strictEqual(engine.findCheck(records, "Pharmacist", "P105", "S4"), null);

  var pharmacistP107 = engine.findCheck(records, "Pharmacist", "P107", "C2");
  var doctorAttempt = engine.resolveCheck(pharmacistP107.patient, pharmacistP107.check, {
    reconciledList: "Warfarin 5 mg daily",
    reviewerNote: "Not mine."
  }, { name: "Dr. Niamh O'Sullivan", role: "Doctor", staffId: "DOC-1001" }, "2026-11-19T09:00:00.000Z");
  assert.strictEqual(doctorAttempt.unauthorized, true);
});

test("Resolving an already-passed item is rejected", function () {
  var records = cloneRecords();
  var hit = engine.findCheck(records, "Doctor", "P102", "C3");
  var user = { name: "Dr. Niamh O'Sullivan", role: "Doctor", staffId: "DOC-1001" };
  var values = {
    pcpName: "Dr. R. Patel",
    appointmentDate: "2026-12-02",
    appointmentTime: "10:30",
    doctorNote: "Confirmed."
  };
  var first = engine.resolveCheck(hit.patient, hit.check, values, user, "2026-11-19T09:00:00.000Z");
  assert.strictEqual(first.ok, true);
  var second = engine.resolveCheck(hit.patient, hit.check, values, user, "2026-11-19T09:05:00.000Z");
  assert.strictEqual(second.ok, false);
  assert.ok(second.errors._form);
});

test("Role is read from the account, not supplied by the caller", function () {
  var result = auth.authenticate({
    name: "Aoife Kelly",
    password: "DemoNurse!2026",
    role: "Doctor"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.session.role, "Nurse");
});

test("Five failed attempts lock the account and a correct password is refused", function () {
  auth.clearFailures("DOC-1001");
  var i;
  for (i = 0; i < 5; i += 1) {
    var failure = auth.authenticate({ name: "DOC-1001", password: "wrong" });
    assert.strictEqual(failure.ok, false);
  }
  var locked = auth.authenticate({ name: "DOC-1001", password: "DemoDoctor!2026" });
  assert.strictEqual(locked.ok, false);
  assert.strictEqual(locked.reason, "locked");
  assert.ok(locked.lock.remainingMs > 0);
  auth.clearFailures("DOC-1001");
  var recovered = auth.authenticate({ name: "DOC-1001", password: "DemoDoctor!2026" });
  assert.strictEqual(recovered.ok, true);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
