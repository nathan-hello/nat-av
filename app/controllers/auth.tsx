import type { BuildAction } from "remix/fetch-router";
import type { routes } from "@/routes";
import { Layout } from "@/ui/layout";
import { render } from "@/utils/render";

export const auth: BuildAction<"GET", typeof routes.auth> = {
  handler({ request }) {
    return render(<AuthPage />, request);
  },
};

function AuthPage() {
  return () => (
    <Layout title="Auth">
      <h1>Auth</h1>
      <p>Use this route to start building sign-in, sign-up, and session flows.</p>
      <p>Keep it as a flat file until the route needs multiple actions or route-owned modules.</p>
    </Layout>
  );
}
