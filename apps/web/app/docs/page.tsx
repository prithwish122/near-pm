import DocPage, { generateMetadata as meta } from "./[slug]/page";

export const generateMetadata = () => meta({ params: { slug: "introduction" } });

export default function DocsHome() {
  return <DocPage params={{ slug: "introduction" }} />;
}
