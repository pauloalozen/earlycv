const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

type SeoHeroProps = {
  description: string;
  title: string;
};

export function SeoHero({ description, title }: SeoHeroProps) {
  return (
    <header>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
          marginBottom: 16,
        }}
      >
        GUIA PRÁTICO
      </div>
      <h1
        style={{
          fontSize: 40,
          fontWeight: 500,
          letterSpacing: -1.5,
          lineHeight: 1.06,
          margin: "0 0 12px",
          color: "#0a0a0a",
          fontFamily: GEIST,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontSize: 16.5,
          color: "#45443e",
          lineHeight: 1.6,
          margin: 0,
          fontFamily: GEIST,
        }}
      >
        {description}
      </p>
    </header>
  );
}
