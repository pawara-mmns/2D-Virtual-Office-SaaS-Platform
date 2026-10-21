import Link from "next/link";
import { OfficePreview } from "@/components/office-preview";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 sm:px-10 lg:px-16">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="flex min-h-24 items-center justify-between gap-6 border-b border-line">
        <Link href="/" aria-label="Virtual Office home" className="flex items-center gap-3 font-semibold tracking-tight">
          <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-forest text-cream">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="currentColor" shapeRendering="crispEdges">
              <path d="M4 6h6v8h12V6h6v14h-6v6H10v-6H4z" />
            </svg>
          </span>
          Virtual Office
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-4 sm:gap-6">
          <a href="#vision" className="text-sm font-medium text-muted transition-colors hover:text-ink">
            Our vision <span aria-hidden="true" className="ml-1">↗</span>
          </a>
          <Link href="/login" className="text-sm font-medium text-forest hover:underline">Sign in</Link>
        </nav>
      </header>

      <main id="main-content">
        <section aria-labelledby="hero-heading" className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14 lg:py-24">
          <div>
            <p className="mb-7 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-forest uppercase">
              <span aria-hidden="true" className="size-2 bg-forest" />
              A new place to work together
            </p>
            <h1 id="hero-heading" className="max-w-xl text-[clamp(2.75rem,5vw,4.5rem)] leading-[1.06] font-semibold tracking-[-0.055em]">
              A little closer.<br />
              <span className="text-forest">Wherever<br className="hidden lg:block" /> you work.</span>
            </h1>
            <p className="mt-7 max-w-md text-base leading-7 text-muted sm:text-lg sm:leading-8">
              Great teams need a place to come together. We’re building a virtual
              office that brings the everyday connection back to working apart.
            </p>
            <a href="#vision" className="mt-8 inline-flex min-h-12 items-center gap-6 rounded-lg bg-forest px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-forest-hover">
              Explore the vision <span aria-hidden="true">↓</span>
            </a>
            <p className="mt-4 text-xs text-muted">In development. Thoughtfully, one step at a time.</p>
          </div>
          <OfficePreview />
        </section>

        <section id="vision" aria-labelledby="vision-heading" className="scroll-mt-8 border-t border-line py-12 sm:py-16">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-forest uppercase">The idea is simple</p>
              <h2 id="vision-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">Less distance. More together.</h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-muted">A small, intentional space for the moments that make a team.</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            <article>
              <span className="font-mono text-xs text-forest">01 / A sense of place</span>
              <h3 className="mt-4 text-base font-semibold">Your team’s own corner</h3>
              <p className="mt-2 text-sm leading-7 text-muted">A private pixel-art office, designed to feel familiar. Room for focused work and shared moments.</p>
            </article>
            <article>
              <span className="font-mono text-xs text-forest">02 / Everyday connection</span>
              <h3 className="mt-4 text-base font-semibold">Make room for a hello</h3>
              <p className="mt-2 text-sm leading-7 text-muted">The vision: easy conversations, quick questions, and the little interactions between scheduled meetings.</p>
            </article>
            <article>
              <span className="font-mono text-xs text-forest">03 / A calmer workday</span>
              <h3 className="mt-4 text-base font-semibold">Together, at your own pace</h3>
              <p className="mt-2 text-sm leading-7 text-muted">A thoughtful balance of presence and personal space, with a clean interface that stays out of the way.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="flex flex-col justify-between gap-3 border-t border-line py-7 text-xs text-muted sm:flex-row">
        <p>Virtual Office</p>
        <p>Built for people. Connected by a shared place.</p>
      </footer>
    </div>
  );
}
