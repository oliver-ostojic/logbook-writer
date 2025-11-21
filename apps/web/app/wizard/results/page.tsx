"use client";

import React from "react";
import Link from "next/link";

export default function WizardResultsPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Logbook Results</h1>

      <div style={{ 
        padding: 32, 
        background: "#f9f9f9", 
        border: "1px solid #ddd", 
        borderRadius: 8,
        textAlign: "center",
      }}>
        <p style={{ fontSize: 18, color: "#666", marginBottom: 16 }}>
          Logbook generation coming soon!
        </p>
        <p style={{ fontSize: 14, color: "#888" }}>
          This page will display:
          <br />• Generated logbook
          <br />• Violations
          <br />• KPIs
          <br />• And more...
        </p>
      </div>

      <div style={{ marginTop: 24 }}>
        <Link href="/wizard/store-rules">← Back to Store Rules</Link>
      </div>
    </main>
  );
}
