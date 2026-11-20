var DCMEngine = (function () {
  "use strict";

  var OPEN_STATUSES = { Failed: true, Partial: true, Incomplete: true };
  var SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  function norm(value) {
    return String(value == null ? "" : value).trim().toLowerCase();
  }

  function isOpen(check) {
    return !!check && OPEN_STATUSES[check.status] === true;
  }

  function flatten(records, role) {
    var out = [];
    (records || []).forEach(function (patient) {
      (patient.checks || []).forEach(function (check) {
        if (!role || check.owner === role) {
          out.push({ patient: patient, check: check });
        }
      });
    });
    return out;
  }

  function rolePatients(records, role) {
    var seen = {};
    var out = [];
    (records || []).forEach(function (patient) {
      var owns = (patient.checks || []).some(function (check) { return check.owner === role; });
      if (owns && !seen[patient.id]) {
        seen[patient.id] = true;
        out.push(patient);
      }
    });
    return out;
  }

  function filterByRole(records, role, filters) {
    filters = filters || {};
    var search = norm(filters.search);
    var severity = filters.severity || "All";

    return flatten(records, role).filter(function (item) {
      if (!isOpen(item.check)) return false;
      if (severity !== "All" && item.check.severity !== severity) return false;
      if (search) {
        var haystack = norm([
          item.patient.id,
          item.patient.encounterId,
          item.patient.name,
          item.patient.department,
          item.check.id,
          item.check.title,
          item.check.why,
          item.check.evidence
        ].join(" "));
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      var sa = SEVERITY_ORDER[a.check.severity];
      var sb = SEVERITY_ORDER[b.check.severity];
      if (sa !== sb) return (sa == null ? 4 : sa) - (sb == null ? 4 : sb);
      var da = String(a.check.raisedAt || a.patient.dischargeDate || "");
      var db = String(b.check.raisedAt || b.patient.dischargeDate || "");
      if (da !== db) return da < db ? -1 : 1;
      if (a.patient.id !== b.patient.id) return a.patient.id < b.patient.id ? -1 : 1;
      return String(a.check.id).localeCompare(String(b.check.id));
    });
  }

  function computeMetrics(records, role) {
    var checks = flatten(records, role);
    var patients = rolePatients(records, role);
    var totalChecks = checks.length;
    var passedChecks = checks.filter(function (x) { return x.check.status === "Passed"; }).length;
    var openChecks = checks.filter(function (x) { return isOpen(x.check); }).length;
    var completeChecks = checks.filter(function (x) {
      return x.check.status === "Passed" || (isOpen(x.check) && x.check.fieldsComplete === true);
    }).length;
    var resolvedChecks = checks.filter(function (x) { return !!x.check.resolution; }).length;
    var flaggedHandoffs = checks.filter(function (x) { return isOpen(x.check) || !!x.check.resolution; }).length;
    var flaggedPatients = patients.filter(function (patient) {
      return (patient.checks || []).some(function (check) {
        return check.owner === role && isOpen(check);
      });
    }).length;

    return {
      totalPatients: patients.length,
      flaggedPatients: flaggedPatients,
      defectRate: patients.length ? flaggedPatients / patients.length : null,
      totalChecks: totalChecks,
      passedChecks: passedChecks,
      openChecks: openChecks,
      completeChecks: completeChecks,
      resolvedChecks: resolvedChecks,
      flaggedHandoffs: flaggedHandoffs,
      accuracy: totalChecks ? passedChecks / totalChecks : null,
      completeness: totalChecks ? completeChecks / totalChecks : null,
      handoffEfficiency: flaggedHandoffs ? resolvedChecks / flaggedHandoffs : null
    };
  }

  function findCheck(records, role, patientId, checkId) {
    var match = null;
    (records || []).forEach(function (patient) {
      if (patient.id !== patientId) return;
      (patient.checks || []).forEach(function (check) {
        if (check.id === checkId && check.owner === role) {
          match = { patient: patient, check: check };
        }
      });
    });
    return match;
  }

  function parseDate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!m) return null;
    var date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) {
      return null;
    }
    return date;
  }

  function validateTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  }

  function validateField(field, value, patient) {
    var text = String(value == null ? "" : value).trim();

    if (field.required && !text) {
      return "This field is required.";
    }
    if (!text) return null;

    if (field.type === "select") {
      if ((field.options || []).indexOf(text) === -1) return "Select a valid option.";
      if (field.rule === "mustBeYes" && text !== "Yes") {
        return "Select Yes for " + field.label + " to resolve this item.";
      }
    }

    if (field.type === "date") {
      var date = parseDate(text);
      if (!date) return "Enter a real date in YYYY-MM-DD format.";
      if (field.rule === "afterDischarge") {
        var discharge = parseDate(patient.dischargeDate);
        if (!discharge) return "The discharge date is missing, so this date cannot be validated.";
        if (date.getTime() <= discharge.getTime()) {
          return "Choose a date after the discharge date (" + patient.dischargeDate + ").";
        }
      }
    }

    if (field.type === "time" && !validateTime(text)) {
      return "Enter a real time in HH:MM format.";
    }

    return null;
  }

  function noteFrom(values) {
    var keys = Object.keys(values || {});
    for (var i = 0; i < keys.length; i += 1) {
      if (/note$/i.test(keys[i]) && String(values[keys[i]] || "").trim()) {
        return String(values[keys[i]]).trim();
      }
    }
    return "Resolved through the discharge audit dashboard.";
  }

  function resolveCheck(patient, check, values, user, timestamp) {
    if (!patient || !check || !user) {
      return { ok: false, unauthorized: true, errors: {} };
    }
    if (check.owner !== user.role) {
      return { ok: false, unauthorized: true, errors: {} };
    }
    if (!isOpen(check)) {
      return { ok: false, errors: { _form: "This item is already resolved." } };
    }

    var errors = {};
    (check.fields || []).forEach(function (field) {
      var error = validateField(field, values[field.name], patient);
      if (error) errors[field.name] = error;
    });

    if (Object.keys(errors).length) {
      return { ok: false, errors: errors };
    }

    var before = check.status;
    check.status = "Passed";
    check.handoffStatus = "Completed";
    check.resolution = {
      by: user.name,
      role: user.role,
      staffId: user.staffId,
      at: timestamp || new Date().toISOString(),
      values: JSON.parse(JSON.stringify(values || {})),
      note: noteFrom(values)
    };

    return {
      ok: true,
      before: before,
      after: "Passed",
      patient: patient,
      check: check,
      note: check.resolution.note
    };
  }

  return {
    OPEN_STATUSES: OPEN_STATUSES,
    SEVERITY_ORDER: SEVERITY_ORDER,
    isOpen: isOpen,
    flatten: flatten,
    rolePatients: rolePatients,
    filterByRole: filterByRole,
    computeMetrics: computeMetrics,
    findCheck: findCheck,
    parseDate: parseDate,
    validateField: validateField,
    resolveCheck: resolveCheck
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = DCMEngine;
}
