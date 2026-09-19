const PALETTE = ["#4c8dff", "#34c77b", "#e0a23c", "#e06a6a", "#3cc4c4", "#7fb84c"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="avatar" style={{ background: colorForName(name) }}>
      {initial}
    </span>
  );
}
