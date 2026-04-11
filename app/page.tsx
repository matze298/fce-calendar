import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background font-sans">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-24 px-8 bg-white shadow-lg sm:items-start rounded-xl my-8">
        <div className="flex flex-col items-center gap-8 w-full sm:items-start">
          <Image
            src="/fce-logo.png"
            alt="1. FC Egenhausen Logo"
            width={120}
            height={120}
            priority
            className="drop-shadow-md"
          />
          
          <div className="flex flex-col items-center gap-4 text-center sm:items-start sm:text-left">
            <h1 className="text-4xl font-bold tracking-tight text-secondary">
              FCE Schichtkalender
            </h1>
            <p className="max-w-md text-lg leading-relaxed text-muted">
              Willkommen beim Schichtsystem des 1. FC Egenhausen. Verwalten Sie Vereinsdienste, Verfügbarkeiten und Zuweisungen effizient.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full mt-12 sm:flex-row">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-secondary font-bold transition-all hover:opacity-90 shadow-md sm:w-48"
          >
            Schichten verwalten
          </button>
          <button
            className="flex h-12 w-full items-center justify-center rounded-lg border-2 border-secondary px-5 font-bold text-secondary transition-colors hover:bg-secondary hover:text-white sm:w-48"
          >
            Mitglieder-Login
          </button>
        </div>
      </main>
      
      <footer className="py-8 text-muted text-sm">
        © {new Date().getFullYear()} 1. FC Egenhausen 1965 e.V.
      </footer>
    </div>
  );
}
