import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Constraints' };

export default function ConstraintsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Constraints</h1>
      <p className="mt-2 text-muted-foreground">Configure scheduling rules (hard and soft constraints).</p>
    </div>
  );
}
