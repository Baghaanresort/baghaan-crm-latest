import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-stone-50"
      style={{ fontFamily: "'Lora', Georgia, serif" }}
    >
      <div className="text-center">
        <h1
          className="text-6xl text-emerald-900 mb-4"
          style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
        >
          404
        </h1>
        <p className="text-stone-500 italic mb-6">This page could not be found.</p>
        <Link
          href="/dashboard"
          className="bg-emerald-900 text-amber-100 px-6 py-2.5 text-sm tracking-wider hover:bg-emerald-800 transition"
        >
          BACK TO DASHBOARD
        </Link>
      </div>
    </div>
  );
}
