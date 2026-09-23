import { categories } from "./ClientDashboard.jsx";

export default function Footer({ theme = "primary" }) {
  return (
    <footer className="bg-white py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <a href="/" className="text-2xl font-extrabold tracking-tight">
              <span className="text-gray-900">Task</span>
              <span className="text-primary-700">Panda</span>
            </a>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              Connecting homeowners with trusted local tradespeople since 2026.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900">Services</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-500">
              {categories.slice(0, 5).map((cat) => (
                <li key={cat.name}>
                  <a href="/explore" className="transition hover:text-gray-900">
                    {cat.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900">Company</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-500">
              <li>
                <a href="/about" className="transition hover:text-gray-900">
                  About Us
                </a>
              </li>
              <li>
                <a href="/careers" className="transition hover:text-gray-900">
                  Careers
                </a>
              </li>
              <li>
                <a href="/blog" className="transition hover:text-gray-900">
                  Blog
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-900">Support</h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-500">
              <li>
                <a href="/help-center" className="transition hover:text-gray-900">
                  Help Center
                </a>
              </li>
              <li>
                <a href="/contact" className="transition hover:text-gray-900">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="/privacy" className="transition hover:text-gray-900">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 border-t border-gray-100 pt-6 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} TaskPanda. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
