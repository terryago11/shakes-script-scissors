interface Props {
  name: string;
  minutes: number;
}

export default function PauseIndicator({ name, minutes }: Props) {
  return (
    <div className="my-3 mx-0 flex items-center gap-3 px-4 py-2 rounded border border-amber-200 bg-amber-50 text-sm text-amber-700">
      <span className="shrink-0">⏸</span>
      <span className="font-medium">{name}</span>
      <span className="text-amber-500">{minutes} min</span>
    </div>
  );
}
