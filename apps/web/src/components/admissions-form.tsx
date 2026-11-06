"use client";

import { useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";

const steps = ["Parent", "Child", "Program", "Emergency contact", "Documents", "Review"];
type AdmissionsField = {
  name: string;
  label: string;
  type?: "email" | "tel" | "date" | "textarea" | "select";
  options?: string[];
  required?: boolean;
};
const fieldsByStep: [AdmissionsField[], AdmissionsField[], AdmissionsField[], AdmissionsField[]] = [
  [
    { name: "parentFirstName", label: "First name", required: true },
    { name: "parentLastName", label: "Last name", required: true },
    { name: "parentEmail", label: "Email address", type: "email", required: true },
    { name: "parentPhone", label: "Phone number", type: "tel", required: true },
    { name: "parentAddress", label: "Home address", type: "textarea", required: true },
    { name: "relation", label: "Relationship to child", type: "select", options: ["MOTHER", "FATHER", "GUARDIAN", "OTHER"], required: true },
  ],
  [
    { name: "childFirstName", label: "Child’s first name", required: true },
    { name: "childLastName", label: "Child’s last name", required: true },
    { name: "childDateOfBirth", label: "Date of birth", type: "date", required: true },
    { name: "childGender", label: "Gender", type: "select", options: ["PREFER_NOT_TO_SAY", "FEMALE", "MALE", "OTHER"] },
    { name: "allergies", label: "Known allergies", type: "textarea" },
    { name: "medicalNotes", label: "Important medical information", type: "textarea" },
  ],
  [
    { name: "requestedProgram", label: "Program", type: "select", options: ["INFANTS", "TODDLERS", "PRESCHOOL", "EARLY_LEARNING"], required: true },
    { name: "requestedStartDate", label: "Preferred start date", type: "date", required: true },
    { name: "additionalInfo", label: "Anything else you would like us to know?", type: "textarea" },
  ],
  [
    { name: "emergencyContactName", label: "Contact’s full name", required: true },
    { name: "emergencyContactPhone", label: "Phone number", type: "tel", required: true },
    { name: "emergencyContactRelation", label: "Relationship to child", required: true },
  ],
];

type Submission = {
  reference: string;
  status: string;
};

function labelForOption(option: string) {
  return option.replaceAll("_", " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export function AdmissionsForm() {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({
    relation: "OTHER",
    childGender: "PREFER_NOT_TO_SAY",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<Submission>("/enrollment-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSubmission(result);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "We could not connect to the nursery API. Please make sure the API is running, then try submitting again."
          : cause instanceof Error
            ? cause.message
            : "We could not submit your application. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  if (submission) {
    return (
      <section aria-live="polite" className="mt-12 rounded-[28px] border border-[#d9eadf] bg-white p-7 shadow-[0_16px_46px_rgba(27,56,42,0.06)] sm:p-10">
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e6f4ed] text-2xl text-[#26714c]" aria-hidden="true">✓</span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#54836a]">Application received</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-[#17342d]">Thank you, {values.parentFirstName}.</h2>
          <p className="mt-3 text-sm leading-6 text-[#687c73]">Our admissions team will review your application and contact you using the details provided.</p>
          <p className="mt-6 rounded-2xl bg-[#f5f9f6] p-4 text-sm text-[#52675e]">Your reference number: <strong className="ml-1 font-bold text-[#26714c]">{submission.reference}</strong></p>
          <p className="mt-4 text-xs leading-5 text-[#84928b]">Please keep this reference for your records. Do not send sensitive documents by email; our team will explain a secure way to provide any documents needed.</p>
        </div>
      </section>
    );
  }

  const fields = fieldsByStep[step as 0 | 1 | 2 | 3];
  return (
    <section className="mt-12 rounded-[28px] border border-[#e5ede8] bg-white p-5 shadow-[0_16px_46px_rgba(27,56,42,0.06)] sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#54836a]">Enrollment application</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#17342d]">A few details to get started.</h2>
          <p className="mt-3 text-sm leading-6 text-[#74847d]">Complete each step and our team will follow up with you personally.</p>
          <ol aria-label="Application progress" className="mt-7 space-y-3">
            {steps.map((label, index) => (
              <li key={label} aria-current={index === step ? "step" : undefined} className={`flex items-center gap-3 text-sm ${index === step ? "font-bold text-[#286d4d]" : index < step ? "font-medium text-[#52675e]" : "text-[#98a49e]"}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs ${index === step ? "bg-[#286d4d] text-white" : index < step ? "bg-[#e6f4ed] text-[#286d4d]" : "bg-[#f1f4f2] text-[#84928b]"}`}>{index < step ? "✓" : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        </div>

        <form onSubmit={step === 5 ? (event) => void submit(event) : advance} className="min-w-0">
          <div className="border-b border-[#edf1ee] pb-5">
            <p className="text-xs font-semibold text-[#7d8c84]">STEP {step + 1} OF {steps.length}</p>
            <h3 className="mt-1 text-xl font-bold text-[#17342d]">{steps[step]}</h3>
          </div>

          {step < 4 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <label key={field.name} className={`block text-sm font-semibold text-[#3d594e] ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
                  {field.label}{field.required && <span aria-hidden="true" className="ml-1 text-[#bf5a45]">*</span>}
                  {field.type === "textarea" ? (
                    <textarea name={field.name} required={field.required} maxLength={field.name === "parentAddress" ? 500 : 4000} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} rows={3} className="mt-1.5 w-full rounded-xl border border-[#dfe8e3] bg-[#fcfdfc] px-3.5 py-3 text-sm font-normal text-[#17342d] outline-none transition focus:border-[#65a17b] focus:ring-2 focus:ring-[#e2f1e7]" />
                  ) : field.type === "select" ? (
                    <select name={field.name} required={field.required} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#dfe8e3] bg-[#fcfdfc] px-3.5 py-3 text-sm font-normal text-[#17342d] outline-none focus:border-[#65a17b] focus:ring-2 focus:ring-[#e2f1e7]">
                      {["", ...(field.options ?? [])].map((option) => <option key={option || "placeholder"} value={option}>{option ? labelForOption(option) : "Select an option"}</option>)}
                    </select>
                  ) : (
                    <input name={field.name} type={field.type ?? "text"} required={field.required} maxLength={field.name.includes("Name") || field.name.includes("name") ? 120 : undefined} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-[#dfe8e3] bg-[#fcfdfc] px-3.5 py-3 text-sm font-normal text-[#17342d] outline-none focus:border-[#65a17b] focus:ring-2 focus:ring-[#e2f1e7]" />
                  )}
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 rounded-2xl border border-[#f0dfc5] bg-[#fffaf2] p-5">
              <h4 className="font-bold text-[#6b4d2a]">Documents are handled securely after review</h4>
              <p className="mt-2 text-sm leading-6 text-[#806d50]">This form does not upload or email identity, medical, or other sensitive documents. If documents are needed, the admissions team will contact you with a secure way to provide them.</p>
            </div>
          )}

          {step === 5 && (
            <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ["Parent", `${values.parentFirstName} ${values.parentLastName} · ${values.parentEmail}`],
                ["Child", `${values.childFirstName} ${values.childLastName} · ${values.childDateOfBirth}`],
                ["Program", `${labelForOption(values.requestedProgram)} · starts ${values.requestedStartDate}`],
                ["Emergency contact", `${values.emergencyContactName} · ${values.emergencyContactPhone}`],
              ].map(([label, value]) => <div key={label} className="rounded-xl bg-[#f7faf8] p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-[#84928b]">{label}</dt><dd className="mt-1 text-sm font-medium text-[#3d594e]">{value}</dd></div>)}
              <p className="sm:col-span-2 text-xs leading-5 text-[#84928b]">By submitting, you are sharing the information above with the nursery admissions team so they can respond to your enrollment inquiry.</p>
            </dl>
          )}

          {error && <p role="alert" className="mt-5 rounded-xl border border-[#f1d5ce] bg-[#fff7f5] px-4 py-3 text-sm text-[#9b4432]">{error}</p>}
          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[#edf1ee] pt-5 sm:flex-row sm:justify-between">
            <button type="button" disabled={step === 0 || submitting} onClick={() => { setError(null); setStep((current) => Math.max(current - 1, 0)); }} className="rounded-xl border border-[#dfe8e3] px-5 py-3 text-sm font-semibold text-[#52675e] transition hover:bg-[#f8faf9] disabled:invisible">Back</button>
            {step < steps.length - 1 ? <button type="submit" className="rounded-xl bg-[#286d4d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#205b40]">Continue</button> : <button type="submit" disabled={submitting} className="rounded-xl bg-[#286d4d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#205b40] disabled:cursor-wait disabled:opacity-60">{submitting ? "Submitting…" : "Submit application"}</button>}
          </div>
        </form>
      </div>
    </section>
  );
}
