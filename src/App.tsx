// Phase 0 placeholder that exercises the design tokens. Replaced by the router in Phase 2.
export default function App() {
  return (
    <main className="mx-auto max-w-[1040px] px-[22px] py-16">
      <p className="font-display text-[1.6rem] font-semibold tracking-[-0.02em]">
        Split<em className="font-normal text-biro italic">It</em>
      </p>
      <div className="mt-8 max-w-md rounded-pen border-pen bg-sheet p-6 shadow-offset-lg">
        <h1 className="text-3xl">
          Setup is <span className="highlighter">done</span>.
        </h1>
        <p className="mt-2 text-muted">The app arrives in Phase 2.</p>
        <p className="mt-4">
          Total <span className="fig-total">₦0</span>
        </p>
      </div>
    </main>
  )
}
