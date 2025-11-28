'use client';
import React from 'react';

export default function ResultsPlaceholderPage({ params }: { params: { storeId: string } }) {
  const { storeId } = params;
  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Results (Placeholder)</h2>
      <p>Store <strong>{storeId}</strong> — schedule results will appear here once generated.</p>
      <ul>
        <li>Summary metrics</li>
        <li>Editable grid (future)</li>
        <li>Export / finalize actions</li>
      </ul>
    </section>
  );
}
