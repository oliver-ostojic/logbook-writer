export default function RootPage() {
  return (
    <main>
      <h1>Logbook Writer</h1>
      {/* TODO: Add store selection UI */}
      <p>
        <a href="/stores/1/home">Go to Store 1 Home</a>
      </p>
      <p>
        <a href="/wizard/init">Start Wizard ▶</a>
      </p>
    </main>
  );
}
