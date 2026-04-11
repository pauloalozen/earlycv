import RootTemplate from "../template";

export default function AdaptarTemplate({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootTemplate>{children}</RootTemplate>;
}
