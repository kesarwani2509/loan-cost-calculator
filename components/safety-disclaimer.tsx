import type { ReactNode } from "react";

export function SafetyDisclaimer({ lenderFound }: { lenderFound?: boolean | null }) {
  return (
    <footer className="mt-8 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-700 shadow-xs">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-stone-900">Important Disclaimer & Borrower Protection</h3>
        <p className="text-stone-600 leading-relaxed">
          This calculator is strictly an educational tool to reveal the true annual cost of loans. It is not financial advice and does not recommend whether you should borrow or which lender to choose. We do not ask for or store your name, phone number, PAN, or Aadhaar.
        </p>
      </div>

      {lenderFound === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-950">
          <p className="font-semibold">⚠️ Lender not found in RBI Registered List</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">
            The lender or app name does not match any currently active RBI-registered NBFC. You can verify authorized lenders or lodge complaints against illegal digital lending apps directly on the{" "}
            <a
              href="https://sachet.rbi.org.in"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline decoration-amber-700 underline-offset-2"
            >
              RBI Sachet Portal (sachet.rbi.org.in)
            </a>.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-950">
        <p className="font-semibold">Facing threats, harassment, or contact-list abuse?</p>
        <p className="mt-1 text-xs leading-relaxed text-red-900">
          Under RBI guidelines, lenders and their recovery agents are strictly prohibited from harassing borrowers, accessing phone contacts, or using intimidation.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-medium">
          <a
            href="tel:1930"
            className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-white shadow-xs hover:bg-red-800"
          >
            📞 National Cyber Crime Helpline: 1930
          </a>
          <a
            href="https://cybercrime.gov.in"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-red-900 hover:bg-red-100"
          >
            🌐 cybercrime.gov.in
          </a>
        </div>
      </div>
    </footer>
  );
}

