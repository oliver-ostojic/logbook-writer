interface ErrorMessageBoxProps {
  errors: string[];
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

export default function ErrorMessageBox({ errors }: ErrorMessageBoxProps) {
  if (errors.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {errors.map((error, index) => (
        <div
          key={index}
          className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          <span>{renderBold(error)}</span>
        </div>
      ))}
    </div>
  );
}
