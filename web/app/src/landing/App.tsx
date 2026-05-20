import { MotionConfig } from 'motion/react';
import { Nav } from './nav';
import { Hero } from './hero';
import {
  IsolationSection,
  HowItWorks,
  TestCasesSection,
  SpeedSection,
  GetStartedSection,
  Footer,
} from './sections';
import { LanguageMatrix } from './languages';
import { PlaygroundTeaser } from './playground-teaser';
import { ScrollProgress } from './motion';

/*
 * Landing orchestrator — post-redesign section order:
 *
 *   Nav         → sticky, slim, theme toggle
 *   Hero        → calm statement + animated curl terminal
 *   Isolation   → 8-layer ring diagram with hoverable layer detail
 *   How it works→ 3-step lifecycle (Submit · Sandbox · Stream)
 *   Languages   → 7-card grid (Core 7)
 *   Test cases  → batch submissions (one program, many inputs)
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
    // `reducedMotion="user"` makes every motion component honour the OS
    // "reduce motion" setting automatically — transforms collapse to plain
    // opacity, no per-component guards needed.
    <MotionConfig reducedMotion="user">
      <div className="zc-root">
        <ScrollProgress />
        <Nav />
        <Hero />
        <IsolationSection />
        <HowItWorks />
        <LanguageMatrix />
        <TestCasesSection />
        <SpeedSection />
        <PlaygroundTeaser />
        <GetStartedSection />
        <Footer />
      </div>
    </MotionConfig>
  );
}
