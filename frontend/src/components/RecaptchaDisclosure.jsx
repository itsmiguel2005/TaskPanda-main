export default function RecaptchaDisclosure() {
  return (
    <p className="text-center text-xs leading-5 text-slate-500">
      This site is protected by reCAPTCHA and the Google{" "}
      <a
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-slate-700"
      >
        Privacy Policy
      </a>{" "}
      and{" "}
      <a
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-slate-700"
      >
        Terms of Service
      </a>{" "}
      apply.
    </p>
  );
}
