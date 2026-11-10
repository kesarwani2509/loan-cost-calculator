"use client";

import { useMemo, useState, useRef } from "react";
import { formatPercent, formatRupees, presets, summarise, getComparisons } from "@/lib/finance";
import type { LoanTerms, Payment, ComparisonItem } from "@/lib/finance";

type Row = {
  amount: string;
  dueInDays: string;
  tYears?: number;
};

const firstPreset = presets[0];

export function Calculator() {
  const [principal, setPrincipal] = useState(paiseToInput(firstPreset.terms.principalPaise));
  const [received, setReceived] = useState(paiseToInput(firstPreset.terms.receivedPaise));
  const [fees, setFees] = useState(paiseToInput(firstPreset.terms.feesPaise));
  const [rows, setRows] = useState<Row[]>(paymentsToRows(firstPreset.terms.payments));
  const [presetId, setPresetId] = useState(firstPreset.id);
  const [showAllRows, setShowAllRows] = useState(false);

  // Phase 3 UI: Voice audio recording & Screenshot image check
  const [isRecording, setIsRecording] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [lenderInfo, setLenderInfo] = useState<string | null>(null);
  const [apiSummaryPenalty, setApiSummaryPenalty] = useState<{ amountRupees: number; label: "once" | "per_day" } | null>(null);
  const [apiSummaryRollover, setApiSummaryRollover] = useState<{ feeRupees: number; effectiveAnnualRateDisplay: string } | null>(null);
  const [spokenLanguage, setSpokenLanguage] = useState<"hi" | "ta" | "bn">("hi");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activePreset = presets.find((preset) => preset.id === presetId);
  const repeated = repeatedPayments(rows);
  const hideRows = repeated !== null && !showAllRows;

  const summary = useMemo(() => {
    const receivedPaise = rupeesToPaise(received);
    const feesPaise = rupeesToPaise(fees);
    const terms: LoanTerms = {
      principalPaise: rupeesToPaise(principal),
      receivedPaise,
      feesPaise,
      payments: rows
        .map((row) => toPayment(row))
        .filter((payment) => payment.amountPaise > 0 && payment.dueInDays > 0),
    };
    return summarise(terms);
  }, [principal, received, fees, rows]);

  // Phase 3: Comparison rates against banks/SHGs/gold loans
  const comparisons: ComparisonItem[] = useMemo(() => {
    return getComparisons(rupeesToPaise(principal), summary.holdingDays || 30);
  }, [principal, summary.holdingDays]);

  function applyPreset(id: string) {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    setPresetId(id);
    setShowAllRows(false);
    setPrincipal(paiseToInput(preset.terms.principalPaise));
    setReceived(paiseToInput(preset.terms.receivedPaise));
    setFees(paiseToInput(preset.terms.feesPaise));
    setRows(paymentsToRows(preset.terms.payments));
    setApiNotice(null);
    setLenderInfo(null);
    setApiSummaryPenalty(null);
    setApiSummaryRollover(null);
  }

  function editRow(index: number, field: "amount" | "dueInDays", value: string) {
    setPresetId("");
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return field === "dueInDays"
          ? { ...row, [field]: value, tYears: undefined }
          : { ...row, [field]: value };
      }),
    );
  }

  // Phase 3: Speak explanation audio via /api/speak (under 40 seconds)
  async function handleSpeakExplanation() {
    if (summary.effectiveAnnualRate === null) return;
    setIsPlayingAudio(true);
    try {
      const textToSpeak = `The effective yearly cost of this loan is approximately ${formatPercent(
        summary.effectiveAnnualRate,
      )}. Total payback is ${formatRupees(summary.totalRepayPaise)}, costing ${formatRupees(
        summary.totalCostPaise,
      )} over ${summary.holdingDays} days.`;

      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, language: spokenLanguage }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      const cleanup = () => { URL.revokeObjectURL(audioUrl); setIsPlayingAudio(false); };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch (e) {
      setIsPlayingAudio(false);
      alert(e instanceof Error ? e.message : "Audio synthesis unavailable.");
    }
  }

  // Phase 3: Handle screenshot file upload
  async function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setApiLoading(true);
    setApiNotice(null);
    setLenderInfo(null);
    setApiSummaryPenalty(null);
    setApiSummaryRollover(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.kind === "summary") {
        setPrincipal(String(data.summary.principalRupees));
        setReceived(String(data.summary.receivedRupees));
        setFees(String(data.summary.feesRupees));
        setRows(data.summary.payments.map((payment: { amountRupees: number; dueInDays: number; tYears?: number }) => ({
          amount: String(payment.amountRupees),
          dueInDays: String(payment.dueInDays),
          tYears: payment.tYears,
        })));
        setPresetId("");
        setShowAllRows(false);
        setApiSummaryPenalty(data.summary.penalty ?? null);
        setApiSummaryRollover(data.summary.rollover ?? null);
        if (data.notice) setApiNotice(data.notice);
        if (data.lender) {
          if (data.lender.found) {
            setLenderInfo(`Lender: ${data.lender.name} (${data.lender.status}) - ${data.lender.matchType}`);
          } else if (data.lender.state === "unable_to_check") {
            setLenderInfo("RBI lender registry could not be checked right now.");
          } else if (data.lender.state === "possible_match") {
            setLenderInfo(`Several possible lender matches were found: ${data.lender.candidates.join(", ")}. Confirm the legal name.`);
          } else {
            setLenderInfo("No matching lender name was found in the RBI NBFC registry.");
          }
        }
      } else if (data.kind === "clarification") {
        setApiNotice(`Clarification required: ${data.question}`);
      } else if (data.kind === "lender") {
        setLenderInfo(data.lender.found
          ? `Lender: ${data.lender.name} (${data.lender.status}) - ${data.lender.matchType}`
          : data.lender.state === "unable_to_check" ? "RBI lender registry could not be checked right now."
          : data.lender.state === "possible_match" ? `Several possible lender matches were found: ${data.lender.candidates.join(", ")}.`
          : "No matching lender name was found in the RBI NBFC registry.");
      } else if (data.kind === "error") {
        setApiNotice(`Error: ${data.message}`);
      }
    } catch (err) {
      setApiNotice(err instanceof Error ? err.message : "Screenshot analysis failed.");
    } finally {
      setApiLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Audio recording handlers
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert("Microphone access denied or unsupported.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function processAudio(blob: Blob) {
    setApiLoading(true);
    setApiNotice(null);
    setLenderInfo(null);
    setApiSummaryPenalty(null);
    setApiSummaryRollover(null);
    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.kind === "summary") {
        setPrincipal(String(data.summary.principalRupees));
        setReceived(String(data.summary.receivedRupees));
        setFees(String(data.summary.feesRupees));
        setRows(data.summary.payments.map((payment: { amountRupees: number; dueInDays: number; tYears?: number }) => ({
          amount: String(payment.amountRupees),
          dueInDays: String(payment.dueInDays),
          tYears: payment.tYears,
        })));
        setPresetId("");
        setShowAllRows(false);
        setApiSummaryPenalty(data.summary.penalty ?? null);
        setApiSummaryRollover(data.summary.rollover ?? null);
      } else if (data.kind === "clarification") {
        setApiNotice(data.question);
      } else if (data.kind === "lender") {
        setLenderInfo(data.lender.found
          ? `Lender: ${data.lender.name} (${data.lender.status}) - ${data.lender.matchType}`
          : data.lender.state === "unable_to_check" ? "RBI lender registry could not be checked right now."
          : data.lender.state === "possible_match" ? `Several possible lender matches were found: ${data.lender.candidates.join(", ")}.`
          : "No matching lender name was found in the RBI NBFC registry.");
      } else if (data.kind === "error") {
        setApiNotice(data.message);
      }
    } catch (err) {
      setApiNotice(err instanceof Error ? err.message : "Voice processing failed.");
    } finally {
      setApiLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Voice & Screenshot Inputs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={apiLoading}
          className={`flex-1 min-h-12 rounded-xl font-medium px-4 text-base transition-colors ${
            isRecording
              ? "bg-red-600 text-white animate-pulse"
              : "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50"
          }`}
        >
          {isRecording ? "🔴 Stop Recording" : "🎤 Speak Loan Offer"}
        </button>

        <label className="flex-1 min-h-12 rounded-xl font-medium border border-stone-300 bg-white text-stone-900 flex items-center justify-center cursor-pointer hover:bg-stone-50 text-base px-4">
          <span>📷 Read Screenshot</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleScreenshotUpload}
            disabled={apiLoading}
          />
        </label>
      </div>

      {apiLoading && <p className="text-sm text-stone-600 animate-pulse">Analyzing with AI model...</p>}
      {apiNotice && <div className="rounded-xl bg-amber-100 p-3 text-sm text-stone-900">{apiNotice}</div>}
      {lenderInfo && <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-900">{lenderInfo}</div>}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-stone-600">Try an example</p>
        <div className="flex flex-col gap-2">
          {presets.map((preset, index) => {
            const selected = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`min-h-12 rounded-xl border px-3 py-2 text-left text-base ${
                  selected
                    ? "border-amber-700 bg-amber-100 text-stone-950"
                    : "border-stone-300 bg-white text-stone-800"
                }`}
              >
                {index + 1}. {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main summary card */}
      <section className="flex flex-col gap-3 rounded-2xl bg-stone-900 p-5 text-stone-50" aria-live="polite">
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-300">Effective yearly rate</p>
          <div className="flex items-center gap-2">
            <select
              value={spokenLanguage}
              onChange={(e) => setSpokenLanguage(e.target.value as "hi" | "ta" | "bn")}
              className="bg-stone-800 text-xs text-stone-200 rounded px-2 py-1 border border-stone-700"
            >
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="bn">Bengali</option>
            </select>
            <button
              type="button"
              onClick={handleSpeakExplanation}
              disabled={isPlayingAudio || summary.effectiveAnnualRate === null}
              className="text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium px-2.5 py-1 rounded disabled:opacity-50"
            >
              {isPlayingAudio ? "🔊 Speaking..." : "🔊 Listen"}
            </button>
          </div>
        </div>

        <p className="text-4xl font-semibold tracking-tight">
          {summary.effectiveAnnualRate === null ? "Could not compute" : formatPercent(summary.effectiveAnnualRate)}
        </p>
        <dl className="grid gap-2 text-lg">
          <div className="flex items-baseline justify-between gap-4">
            <dt>Total payback</dt>
            <dd className="font-medium">{formatRupees(summary.totalRepayPaise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>Cost</dt>
            <dd className="font-medium">{formatRupees(summary.totalCostPaise)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt>Over this loan</dt>
            <dd className="font-medium text-right">
              {summary.holdingPeriodRate === null
                ? "—"
                : `${formatPercent(summary.holdingPeriodRate)} in ${summary.holdingDays} days`}
            </dd>
          </div>
        </dl>
        {activePreset?.note ? <p className="text-sm leading-6 text-stone-200">{activePreset.note}</p> : null}
        {apiSummaryPenalty ? <p className="text-sm text-amber-200">Late-payment exposure: {formatRupees(rupeesToPaise(String(apiSummaryPenalty.amountRupees)))} {apiSummaryPenalty.label === "per_day" ? "per late day" : "once for one missed instalment"}.</p> : null}
        {apiSummaryRollover ? <p className="text-sm text-amber-200">Rollover illustration: {formatRupees(rupeesToPaise(String(apiSummaryRollover.feeRupees)))} fee for the stated extension; effective yearly rate {apiSummaryRollover.effectiveAnnualRateDisplay}.</p> : null}
      </section>

      {/* Comparison with standard alternatives (Phase 3) */}
      <section className="flex flex-col gap-3 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-900">Compare with standard alternatives</h2>
        <p className="text-xs text-stone-500">
          Costs for the same principal amount ({formatRupees(rupeesToPaise(principal))}) under typical bank/SHG rates:
        </p>
        <div className="grid gap-2">
          {comparisons.map((c) => (
            <div key={c.key} className="flex flex-col gap-1 rounded-xl bg-stone-50 border border-stone-200 p-3 text-sm">
              <div className="flex justify-between font-medium text-stone-900">
                <span>{c.label} ({c.rateDisplay})</span>
                <span>{c.totalCostDisplay} cost</span>
              </div>
              <div className="flex justify-between text-stone-600 text-xs">
                <span>Total repay: {c.totalRepayDisplay}</span>
                <span>{c.emiDisplay}/mo</span>
              </div>
              {c.note && <p className="text-[11px] text-stone-500 italic mt-0.5">{c.note}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Manual Input Form */}
      <form className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm" onSubmit={(event) => event.preventDefault()}>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Stated loan principal</span>
          <span className="text-sm text-stone-600">The face amount written in the offer</span>
          <input
            type="number"
            min="0.01"
            max="100000000"
            step="0.01"
            required
            inputMode="decimal"
            value={principal}
            onChange={(event) => {
              setPresetId("");
              setPrincipal(event.target.value);
            }}
            className="min-h-12 rounded-xl border border-stone-300 px-3 text-lg"
          />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Money you actually receive</span>
          <span className="text-sm text-stone-600">Rupees that reach your hand</span>
          <input
            type="number"
            min="0.01"
            max="100000000"
            step="0.01"
            required
            inputMode="decimal"
            value={received}
            onChange={(event) => {
              setPresetId("");
              setReceived(event.target.value);
            }}
            className="min-h-12 rounded-xl border border-stone-300 px-3 text-lg"
          />
        </label>
        <label className="flex flex-col gap-1 text-base">
          <span className="font-medium">Fees taken before you receive it</span>
          <input
            type="number"
            min="0"
            max="100000000"
            step="0.01"
            inputMode="decimal"
            value={fees}
            onChange={(event) => {
              setPresetId("");
              setFees(event.target.value);
            }}
            className="min-h-12 rounded-xl border border-stone-300 px-3 text-lg"
          />
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium">Payments you have to make</legend>
          {hideRows && repeated ? (
            <div className="rounded-xl bg-stone-50 px-3 py-3 text-base leading-6">
              <p>{repeated.summary}</p>
              <button
                type="button"
                onClick={() => setShowAllRows(true)}
                className="mt-2 min-h-12 rounded-xl border border-stone-300 bg-white px-3"
              >
                Edit each payment
              </button>
            </div>
          ) : null}
          {hideRows
            ? null
            : rows.map((row, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Amount (₹)</span>
                    <input
                      type="number"
                      min="0"
                      max="100000000"
                      step="0.01"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) => editRow(index, "amount", event.target.value)}
                      className="min-h-12 rounded-xl border border-stone-300 px-3 text-lg"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span>Due day</span>
                    <input
                      type="number"
                      min="1"
                      max="36500"
                      step="1"
                      inputMode="numeric"
                      value={row.dueInDays}
                      onChange={(event) => editRow(index, "dueInDays", event.target.value)}
                      className="min-h-12 rounded-xl border border-stone-300 px-3 text-lg"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove payment ${index + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => {
                      setPresetId("");
                      setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    }}
                    className="min-h-12 rounded-xl border border-stone-300 px-3 text-sm disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
          {hideRows ? null : (
            <button
              type="button"
              onClick={() => {
                setPresetId("");
                setRows((current) => [...current, { amount: "", dueInDays: "" }]);
              }}
              className="min-h-12 rounded-xl border border-stone-300 bg-stone-50 text-base"
            >
              Add payment
            </button>
          )}
        </fieldset>
      </form>
    </div>
  );
}

function repeatedPayments(rows: Row[]): { summary: string } | null {
  if (rows.length < 6) return null;

  const firstDay = Number(rows[0].dueInDays);
  const lastDay = Number(rows[rows.length - 1].dueInDays);
  const step = (lastDay - firstDay) / (rows.length - 1);
  if (!Number.isFinite(firstDay) || !Number.isFinite(lastDay) || step <= 0) return null;

  const roughlySpaced = rows.every((row, index) => {
    const expected = firstDay + index * step;
    return Math.abs(Number(row.dueInDays) - expected) <= 1.1;
  });
  if (!roughlySpaced) return null;

  const every =
    Math.abs(step - 1) < 0.2
      ? "every day"
      : Math.abs(step - 7) < 0.2
        ? "every week"
        : Math.abs(step - 30.4) < 1.5
          ? "every month"
          : `about every ${Math.round(step)} days`;

  const allEqual = rows.every((row) => row.amount === rows[0].amount);
  if (allEqual) {
    return {
      summary: `${rows.length} payments of ₹${rows[0].amount}, ${every}, from day ${firstDay} to day ${lastDay}.`,
    };
  }

  const interestRows = rows.slice(0, -1);
  const interestEqual = interestRows.every((row) => row.amount === rows[0].amount);
  if (!interestEqual) return null;
  const last = rows[rows.length - 1];
  return {
    summary: `${interestRows.length} interest payments of ₹${rows[0].amount}, then ₹${last.amount} on day ${last.dueInDays} (${every}).`,
  };
}

function paymentsToRows(payments: Payment[]): Row[] {
  return payments.map((payment) => ({
    amount: paiseToInput(payment.amountPaise),
    dueInDays: String(payment.dueInDays),
    tYears: payment.tYears,
  }));
}

function toPayment(row: Row): Payment {
  const payment: Payment = {
    amountPaise: rupeesToPaise(row.amount),
    dueInDays: Math.max(0, Math.round(Number(row.dueInDays) || 0)),
  };
  if (row.tYears !== undefined) payment.tYears = row.tYears;
  return payment;
}

function rupeesToPaise(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function paiseToInput(paise: number): string {
  const amount = paise / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
