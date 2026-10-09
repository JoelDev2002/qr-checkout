type ComingSoonProps = {
  title: string;
};

/** Pantalla mínima para las rutas que se terminan en las tareas siguientes (T2.3, T2.4, T2.8). */
export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <section className="rounded-sheet border border-line bg-surface p-6">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-base text-muted">Próximamente</p>
    </section>
  );
}
