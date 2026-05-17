import { Nav } from './nav';
import { Hero } from './hero';
import { TrustStrip, WhyThreeUp, DeploySection, Footer } from './sections';
import { ArchitectureDiagram } from './diagrams';
import { LanguageMatrix } from './languages';
import { PlaygroundTeaser } from './playground-teaser';

export function App() {
  return (
    <div className="zc-root">
      <Nav />
      <Hero variant="diagram" />
      <TrustStrip />
      <WhyThreeUp />
      <ArchitectureDiagram />
      <LanguageMatrix />
      <PlaygroundTeaser />
      <DeploySection />
      <Footer />
    </div>
  );
}
