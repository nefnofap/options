interface Props {
  title: string;
  body?: string;
}

export default function EmptyState({ title, body }: Props) {
  return (
    <div className="panel p-12 text-center">
      <div className="display-italic text-3xl text-ink-300">{title}</div>
      {body && <p className="mt-3 text-ink-400 text-sm max-w-md mx-auto">{body}</p>}
    </div>
  );
}
