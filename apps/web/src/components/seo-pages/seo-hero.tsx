type SeoHeroProps = {
  description: string;
  title: string;
};

export function SeoHero({ description, title }: SeoHeroProps) {
  return (
    <header className="space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
        guia pratico
      </p>
      <h1 className="text-4xl font-medium tracking-tight md:text-5xl">
        {title}
      </h1>
      <p className="max-w-3xl text-base text-stone-600">{description}</p>
    </header>
  );
}
