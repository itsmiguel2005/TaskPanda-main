import { useNavigate } from "react-router-dom";
import Header from "../components/Header.jsx";

const posts = [
  {
    title: "How to Prepare Your Home for a Deep Clean",
    excerpt:
      "A step-by-step guide to getting your space ready for professional cleaning services.",
    date: "Sep 10, 2026",
    category: "Tips",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "5 Signs You Need a Professional Plumber",
    excerpt:
      "From leaky faucets to low water pressure — know when to call in the experts.",
    date: "Sep 5, 2026",
    category: "Advice",
    color: "bg-blue-100 text-blue-700",
  },
  {
    title: "The Benefits of Hiring TESDA-Certified Pros",
    excerpt:
      "Why certification matters and what it means for your home repair needs.",
    date: "Aug 28, 2026",
    category: "Company",
    color: "bg-primary-100 text-primary-700",
  },
  {
    title: "Seasonal Maintenance Checklist for Filipino Homes",
    excerpt:
      "Keep your home in top shape year-round with our comprehensive checklist.",
    date: "Aug 20, 2026",
    category: "Tips",
    color: "bg-amber-100 text-amber-700",
  },
  {
    title: "How TaskPanda Verifies Every Provider",
    excerpt:
      "Learn about our rigorous verification process that keeps your home safe.",
    date: "Aug 15, 2026",
    category: "Company",
    color: "bg-rose-100 text-rose-700",
  },
  {
    title: "DIY vs Professional: When to Call an Electrician",
    excerpt:
      "Small fixes you can handle yourself versus jobs that need a licensed pro.",
    date: "Aug 8, 2026",
    category: "Advice",
    color: "bg-cyan-100 text-cyan-700",
  },
];

export default function BlogPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header showNav={false} />

      {/* Hero */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            Blog
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Tips, advice, and stories from TaskPanda.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            ← Back to Home
          </button>
        </div>
      </section>

      {/* Posts */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => (
              <article
                key={p.title}
                className="flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md hover:-translate-y-1 animate-fade-in-up"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${p.color}`}
                >
                  {p.category}
                </span>
                <h2 className="mt-4 text-lg font-bold text-gray-900">
                  {p.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">
                  {p.excerpt}
                </p>
                <p className="mt-4 text-xs text-gray-400">{p.date}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
