import Generator from "../components/Generator";

export default function Home() {
  return (
    <main className="container">
      <header>
        <h1>Claude Generate Demo</h1>
        <p className="subtitle">Type a question or a task, then press Generate.</p>
      </header>
      <Generator />
    </main>
  );
}
