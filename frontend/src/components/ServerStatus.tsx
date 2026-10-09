import { LoaderCircle } from "lucide-react";
import { useSlowConnection } from "../lib/connection";

export function ServerStatus() {
  const slow = useSlowConnection();
  if (!slow) return null;
  return (
    <aside className="server-status" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={18} />
      <div>
        <strong>Connecting to your workspace…</strong>
        <p>
          The server may be starting up. This can take about a minute. Please
          keep this page open.
        </p>
      </div>
    </aside>
  );
}
