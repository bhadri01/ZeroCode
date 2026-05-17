import { Nav } from './nav';
import { Hero } from './hero';
import {
  IsolationSection,
  HowItWorks,
  SpeedSection,
  GetStartedSection,
  Footer,
} from './sections';
import { LanguageMatrix } from './languages';
import { PlaygroundTeaser } from './playground-teaser';

/*
 * Landing orchestrator — post-redesign section order:
 *
 *   Nav         → sticky, slim, theme toggle
 *   Hero        → calm statement + animated curl terminal
 *   Isolation   → 8-layer ring diagram with hoverable layer detail
 *   How it works→ 3-step lifecycle (Submit · Sandbox · Stream)
 *   Languages   → 7-card grid (Core 7)
 *   Speed       → single big "<5 ms" stat + latency budget breakdown
 *   Playground  → live teaser (kept from previous landing)
 *   Get started → quickstart commands + CTA
 *   Footer      → minimal columns
 *
 * Dropped: TrustStrip · WhyThreeUp · ArchitectureDiagram · DeploySection.
 * Their content was either redundant or visually over-templated.
 */
export function App() {
  return (
    <div className="zc-root">
      <Nav />
      <Hero />
      <IsolationSection />
      <HowItWorks />
      <LanguageMatrix />
      <SpeedSection />
      <PlaygroundTeaser />
      <GetStartedSection />
      <Footer />
    </div>
  );
}
