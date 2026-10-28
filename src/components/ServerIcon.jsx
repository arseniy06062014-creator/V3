// The server's own icon (from its status response) or a coloured letter tile as fallback.
const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export default function ServerIcon({ icon, name, size = 40 }) {
  const style = { width: size, height: size };
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        style={{ ...style, imageRendering: 'pixelated' }}
        className="shrink-0 rounded-lg border border-white/10"
      />
    );
  }
  const letter = (String(name || '?').trim()[0] || '?').toUpperCase();
  return (
    <div
      style={{ ...style, background: `linear-gradient(135deg, hsl(${hue(name)} 60% 35%), hsl(${(hue(name) + 40) % 360} 60% 20%))` }}
      className="flex shrink-0 items-center justify-center rounded-lg border border-white/10 font-display text-lg font-bold"
    >
      {letter}
    </div>
  );
}
