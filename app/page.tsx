import { Calculator } from "@/components/calculator";
import { SafetyDisclaimer } from "@/components/safety-disclaimer";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Loan Cost Calculator</h1>
        <p className="text-lg leading-7 text-stone-700">
          Enter the money you actually receive and each amount you have to pay back.
        </p>
        <p className="rounded-xl bg-amber-100 px-3 py-3 text-base leading-6 text-stone-900">
          This is a calculator, not financial advice. It does not tell you whether to borrow.
        </p>
      </header>
      <Calculator />
      <SafetyDisclaimer />
    </main>
  );
}
