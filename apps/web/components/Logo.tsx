import Link from "next/link";

export default function Logo({ dark = false }: { dark?: boolean }) {
  const c = dark ? "#13231b" : "#fff";
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-md" aria-label="Ebbflow home">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 8.5 12 3l9 5.5M3 15.5 12 21l9-5.5" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 12h10" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight" style={{ color: c }}>Ebbflow</span>
    </Link>
  );
}
