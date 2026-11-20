function dcmCheck(o) {
  return Object.assign({
    id: "C1",
    label: "Check",
    owner: "Doctor",
    status: "Passed",
    handoffStatus: "Completed",
    severity: "Low",
    title: "",
    why: "",
    evidence: "",
    raisedAt: null,
    fieldsComplete: true,
    fields: [],
    resolution: null
  }, o || {});
}

function dcmPatient(o) {
  return Object.assign({
    preferredLanguage: "English",
    checks: []
  }, o || {});
}

var DCM_SEED = {
  version: 4,
  runLabel: "Run 1 Baseline",
  promptVersion: "v1.0",
  auditPeriod: "01 Nov 2026 - 18 Nov 2026",
  runStatus: "Completed",
  checkedAt: "2026-11-18T08:00:00.000Z",
  snapshotAt: "2026-11-18T23:59:59.000Z",
  patients: [
    dcmPatient({
      id: "P101",
      encounterId: "ENC-2026-101",
      name: "Saoirse Nolan",
      age: 54,
      sex: "F",
      department: "Cardiology",
      admissionDate: "2026-11-10",
      dischargeDate: "2026-11-14",
      checks: [
        dcmCheck({
          id: "C1",
          label: "Discharge summary written & signed",
          owner: "Doctor",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Summary signed by Dr. Niamh O'Sullivan at 2026-11-14T09:12:00.000Z."
        }),
        dcmCheck({
          id: "C2",
          label: "Medication reconciliation completed",
          owner: "Pharmacist",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Medication-level reconciliation PASS signed by Ciaran Murphy."
        }),
        dcmCheck({
          id: "S4",
          label: "Language and teach-back recorded",
          owner: "Nurse",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Teach-back recorded in English on 2026-11-14."
        })
      ]
    }),
    dcmPatient({
      id: "P102",
      encounterId: "ENC-2026-102",
      name: "Sophia Chen",
      age: 64,
      sex: "F",
      department: "Cardiology",
      admissionDate: "2026-11-12",
      dischargeDate: "2026-11-18",
      checks: [
        dcmCheck({
          id: "C1",
          label: "Discharge summary written & signed",
          owner: "Doctor",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Summary signed by Dr. Niamh O'Sullivan at 2026-11-18T08:40:00.000Z."
        }),
        dcmCheck({
          id: "C2",
          label: "Medication reconciliation completed",
          owner: "Pharmacist",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Medication-level reconciliation PASS signed by Ciaran Murphy."
        }),
        dcmCheck({
          id: "C3",
          label: "Follow-up plan documented & sent",
          owner: "Doctor",
          status: "Failed",
          handoffStatus: "Partial",
          severity: "High",
          title: "PCP appointment missing",
          why: "The discharge plan names a PCP but no appointment date or time is booked before discharge.",
          evidence: "PCP: Dr. R. Patel; appointment date: blank; appointment time: blank.",
          raisedAt: "2026-11-18",
          fieldsComplete: false,
          fields: [
            { name: "pcpName", label: "PCP name", type: "text", required: true, placeholder: "Dr. R. Patel", example: "Dr. R. Patel" },
            { name: "appointmentDate", label: "Appointment date", type: "date", required: true, rule: "afterDischarge", example: "2026-12-02" },
            { name: "appointmentTime", label: "Appointment time", type: "time", required: true, example: "10:30" },
            { name: "doctorNote", label: "Doctor note", type: "textarea", required: true, placeholder: "PCP office confirmed the appointment and the patient was informed.", example: "PCP office confirmed the appointment and the patient was informed." }
          ]
        }),
        dcmCheck({
          id: "S4",
          label: "Language and teach-back recorded",
          owner: "Nurse",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Teach-back recorded in English on 2026-11-18."
        })
      ]
    }),
    dcmPatient({
      id: "P103",
      encounterId: "ENC-2026-103",
      name: "Declan Murphy",
      age: 67,
      sex: "M",
      department: "Orthopaedics",
      admissionDate: "2026-11-11",
      dischargeDate: "2026-11-16",
      checks: [
        dcmCheck({
          id: "C1",
          label: "Discharge summary written & signed",
          owner: "Doctor",
          status: "Incomplete",
          handoffStatus: "Partial",
          severity: "Medium",
          title: "Discharge summary incomplete",
          why: "The summary is signed but the diagnosis summary and follow-up plan are blank.",
          evidence: "Summary signed at 2026-11-16T09:40:00.000Z; two required sections empty.",
          raisedAt: "2026-11-16",
          fieldsComplete: false,
          fields: [
            { name: "diagnosisSummary", label: "Diagnosis summary", type: "textarea", required: true, placeholder: "Summarise the admission diagnosis and hospital course.", example: "Right hip replacement; uncomplicated recovery." },
            { name: "followUpPlan", label: "Follow-up plan", type: "textarea", required: true, placeholder: "Document the follow-up plan.", example: "Orthopaedic clinic in two weeks; physiotherapy referral sent." },
            { name: "doctorNote", label: "Doctor note", type: "textarea", required: true, placeholder: "Explain the correction.", example: "Summary completed from the ward round note." }
          ]
        }),
        dcmCheck({
          id: "C2",
          label: "Medication reconciliation completed",
          owner: "Pharmacist",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Medication-level reconciliation PASS signed by Ciaran Murphy."
        })
      ]
    }),
    dcmPatient({
      id: "P104",
      encounterId: "ENC-2026-104",
      name: "Tomasz Kowalski",
      age: 45,
      sex: "M",
      department: "Respiratory",
      admissionDate: "2026-11-13",
      dischargeDate: "2026-11-15",
      preferredLanguage: "Polish",
      checks: [
        dcmCheck({
          id: "C1",
          label: "Discharge summary written & signed",
          owner: "Doctor",
          status: "Passed",
          handoffStatus: "Completed",
          evidence: "Summary signed by Dr. Niamh O'Sullivan at 2026-11-15T14:05:00.000Z."
        }),
        dcmCheck({
          id: "S6",
          label: "Reportable disease and isolation",
          owner: "Doctor",
          status: "Failed",
          handoffStatus: "Failed",
          severity: "High",
          title: "Reportable-disease review missing",
          why: "A reportable condition is documented, but the doctor's review outcome and note are missing.",
          evidence: "Reportable condition: yes; doctor review: blank; isolation status: pending.",
          raisedAt: "2026-11-15",
          fieldsComplete: false,
          fields: [
            { name: "reviewed", label: "Reportable-disease review completed", type: "select", required: true, rule: "mustBeYes", options: ["Yes", "No"], example: "Yes" },
            { name: "doctorNote", label: "Doctor note", type: "textarea", required: true, placeholder: "Record the review and the isolation decision.", example: "Reviewed with infection prevention; isolation status confirmed." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P105",
      encounterId: "ENC-2026-105",
      name: "Ekaterina Petrova",
      age: 44,
      sex: "F",
      department: "Endocrinology",
      admissionDate: "2026-11-09",
      dischargeDate: "2026-11-13",
      preferredLanguage: "Russian",
      checks: [
        dcmCheck({
          id: "S4",
          label: "Language and teach-back recorded",
          owner: "Nurse",
          status: "Failed",
          handoffStatus: "Partial",
          severity: "High",
          title: "Teach-back not recorded",
          why: "The patient has limited English proficiency and a new insulin regimen, but no teach-back or interpreter method is recorded.",
          evidence: "Preferred language: Russian; teach-back: blank; interpreter used: no.",
          raisedAt: "2026-11-13",
          fieldsComplete: false,
          fields: [
            { name: "teachBackDone", label: "Teach-back completed", type: "select", required: true, rule: "mustBeYes", options: ["Yes", "No"], example: "Yes" },
            { name: "language", label: "Language used", type: "select", required: true, options: ["Russian", "English", "Other"], example: "Russian" },
            { name: "interpreterUsed", label: "Interpreter used", type: "select", required: true, options: ["Yes", "No"], example: "Yes" },
            { name: "nurseNote", label: "Nurse note", type: "textarea", required: true, placeholder: "Describe the teach-back and interpreter method.", example: "Insulin device teach-back completed in Russian with interpreter; patient demonstrated the injection." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P106",
      encounterId: "ENC-2026-106",
      name: "Roisin Byrne",
      age: 72,
      sex: "F",
      department: "General Medicine",
      admissionDate: "2026-11-12",
      dischargeDate: "2026-11-16",
      preferredLanguage: "Irish",
      checks: [
        dcmCheck({
          id: "S4",
          label: "Language and teach-back recorded",
          owner: "Nurse",
          status: "Incomplete",
          handoffStatus: "Partial",
          severity: "Medium",
          title: "Patient instructions missing in preferred language",
          why: "Discharge instructions were not given in the patient's preferred language, and interpreter use is not recorded.",
          evidence: "Preferred language: Irish; instructions: blank; interpreter used: blank.",
          raisedAt: "2026-11-16",
          fieldsComplete: false,
          fields: [
            { name: "instructionsGiven", label: "Instructions given in preferred language", type: "select", required: true, rule: "mustBeYes", options: ["Yes", "No"], example: "Yes" },
            { name: "language", label: "Language used", type: "select", required: true, options: ["Irish", "English", "Other"], example: "Irish" },
            { name: "interpreterUsed", label: "Interpreter used", type: "select", required: true, options: ["Yes", "No"], example: "Yes" },
            { name: "nurseNote", label: "Nurse note", type: "textarea", required: true, placeholder: "Record the language and method used.", example: "Written and verbal instructions given in Irish with interpreter support." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P107",
      encounterId: "ENC-2026-107",
      name: "Liam O'Connell",
      age: 77,
      sex: "M",
      department: "Cardiology",
      admissionDate: "2026-11-12",
      dischargeDate: "2026-11-16",
      checks: [
        dcmCheck({
          id: "C2",
          label: "Medication reconciliation completed",
          owner: "Pharmacist",
          status: "Failed",
          handoffStatus: "Failed",
          severity: "High",
          title: "Medication reconciliation mismatch",
          why: "The discharge list omits the home warfarin dose, and no medication-level reviewer note is recorded.",
          evidence: "Home warfarin 5 mg daily; discharge list missing warfarin; pharmacist PASS: blank.",
          raisedAt: "2026-11-16",
          fieldsComplete: true,
          fields: [
            { name: "reconciledList", label: "Reconciled medication list", type: "textarea", required: true, placeholder: "List each discharge medication with dose and frequency.", example: "Warfarin 5 mg daily; Bisoprolol 5 mg daily." },
            { name: "reviewerNote", label: "Reviewer note", type: "textarea", required: true, placeholder: "Explain the medication-level reconciliation.", example: "Warfarin dose confirmed against the admission list; no duplicate therapy." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P108",
      encounterId: "ENC-2026-108",
      name: "Maeve O'Connor",
      age: 61,
      sex: "F",
      department: "Cardiology",
      admissionDate: "2026-10-25",
      dischargeDate: "2026-11-02",
      checks: [
        dcmCheck({
          id: "C2",
          label: "Medication reconciliation completed",
          owner: "Pharmacist",
          status: "Failed",
          handoffStatus: "Partial",
          severity: "Medium",
          title: "Duplicate brand/generic therapy unresolved",
          why: "Lipitor and atorvastatin both appear on the discharge list with the same RxNorm, and no resolution note is recorded.",
          evidence: "RxNorm 617310 appears twice: Lipitor 20 mg and atorvastatin 20 mg.",
          raisedAt: "2026-11-02",
          fieldsComplete: true,
          fields: [
            { name: "duplicateResolved", label: "Duplicate therapy resolved", type: "select", required: true, rule: "mustBeYes", options: ["Yes", "No"], example: "Yes" },
            { name: "reviewerNote", label: "Reviewer note", type: "textarea", required: true, placeholder: "Record which product was kept and why.", example: "Removed duplicate atorvastatin entry; Lipitor 20 mg kept as the sole statin." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P109",
      encounterId: "ENC-2026-109",
      name: "Nora Fitzgerald",
      age: 69,
      sex: "F",
      department: "General Medicine",
      admissionDate: "2026-11-10",
      dischargeDate: "2026-11-15",
      checks: [
        dcmCheck({
          id: "C3",
          label: "Follow-up plan documented & sent",
          owner: "Nurse",
          status: "Incomplete",
          handoffStatus: "Partial",
          severity: "Low",
          title: "Follow-up booking not confirmed",
          why: "A follow-up appointment exists but the patient has not received a send confirmation.",
          evidence: "Appointment: 2026-11-25; send confirmation: blank.",
          raisedAt: "2026-11-15",
          fieldsComplete: false,
          fields: [
            { name: "booked", label: "Follow-up booking confirmed", type: "select", required: true, rule: "mustBeYes", options: ["Yes", "No"], example: "Yes" },
            { name: "sentTo", label: "Confirmation sent to", type: "text", required: true, placeholder: "Patient portal, SMS or phone", example: "Patient portal" },
            { name: "nurseNote", label: "Nurse note", type: "textarea", required: true, placeholder: "Record how the confirmation was sent.", example: "Appointment confirmation sent to the patient portal and read back to the patient." }
          ]
        })
      ]
    }),
    dcmPatient({
      id: "P110",
      encounterId: "ENC-2026-110",
      name: "Sean Murphy",
      age: 63,
      sex: "M",
      department: "General Medicine",
      admissionDate: "2026-11-14",
      dischargeDate: "2026-11-17",
      checks: [
        dcmCheck({
          id: "C3",
          label: "Follow-up plan documented & sent",
          owner: "Doctor",
          status: "Incomplete",
          handoffStatus: "Partial",
          severity: "Medium",
          title: "Follow-up plan incomplete",
          why: "The follow-up plan names a clinic but has no appointment date.",
          evidence: "Clinic: Respiratory; appointment date: blank.",
          raisedAt: "2026-11-17",
          fieldsComplete: false,
          fields: [
            { name: "clinicName", label: "Follow-up clinic", type: "text", required: true, placeholder: "Respiratory Clinic", example: "Respiratory Clinic" },
            { name: "appointmentDate", label: "Appointment date", type: "date", required: true, rule: "afterDischarge", example: "2026-12-01" },
            { name: "doctorNote", label: "Doctor note", type: "textarea", required: true, placeholder: "Record the arrangement.", example: "Respiratory clinic appointment booked and sent to the patient." }
          ]
        })
      ]
    })
  ]
};

var DCM_DEMOS = {
  order: ["doctor", "nurse"],
  cases: {
    doctor: {
      id: "doctor",
      role: "Doctor",
      accountName: "Dr. Niamh O'Sullivan",
      title: "Doctor demo - PCP appointment missing",
      patientId: "P102",
      patientName: "Sophia Chen",
      checkId: "C3",
      severity: "High",
      summary: "Patient 102 (Sophia Chen), High, PCP Appointment Missing.",
      steps: [
        "Open the doctor-owned PCP appointment item.",
        "Enter a PCP name, a real appointment date after 18 Nov 2026, a time, and a note.",
        "Save the resolution. The check turns Passed and the audit log records the change."
      ],
      example: "Demo values: PCP Dr. R. Patel; date 2026-12-02; time 10:30."
    },
    nurse: {
      id: "nurse",
      role: "Nurse",
      accountName: "Aoife Kelly",
      title: "Nurse demo - teach-back not recorded",
      patientId: "P105",
      patientName: "Ekaterina Petrova",
      checkId: "S4",
      severity: "High",
      summary: "Patient 105 (Ekaterina Petrova), High, Teach-back Not Recorded.",
      steps: [
        "Open the nurse-owned teach-back item.",
        "Record teach-back, the language used, interpreter use, and a nurse note.",
        "Save the resolution. The check turns Passed and the nurse KPIs update."
      ],
      example: "Demo values: teach-back Yes; language Russian; interpreter Yes."
    }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { seed: DCM_SEED, demos: DCM_DEMOS };
}
