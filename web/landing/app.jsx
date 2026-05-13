// landing/app.jsx
// Composition root. Production build: theme persists via shared/theme.js (the
// nav has a sun/moon toggle); the dormant Claude Design tweaks panel is no
// longer rendered. Accent / display font / density / hero variant are pinned
// to their best values rather than user-tunable.

function App() {
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

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
