"use client";

import Link from "next/link";
import { useWizardStore } from "../../../lib/wizardStore";

export default function WizardSegmentsPage() {
  const { date, shifts } = useWizardStore();

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Wizard — Segments</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Coming soon. Below is your current init data (for continuity):
      </p>

      <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 8 }}>
        {JSON.stringify({ date, shifts }, null, 2)}
      </pre>

      <div style={{ marginTop: 16 }}>
        <Link href="/wizard/init">← Back to Init</Link>
      </div>
    </main>
  );
}
