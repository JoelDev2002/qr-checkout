/** Logo de la marca. El archivo vive en `frontend/public/img/logo.png` (Vite lo sirve como `/img/logo.png`). */
export function BrandLogo({ className = 'h-10 w-auto' }: { className?: string }) {
  return <img src="/img/logo.png" alt="QRCheckout" className={className} />;
}
