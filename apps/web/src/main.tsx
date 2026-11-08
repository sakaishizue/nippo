import "./styles/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { clearSession } from "./auth/me";
import { LOGIN_PATH, loginPathFor } from "./auth/redirect";
import { createQueryClient } from "./lib/query-client";
import { createAppRouter } from "./router";

// API が 401 を返したら(セッション切れなど)、ログイン画面へ移動する。ログイン後に今の画面へ戻れるようにする
const onUnauthenticated = async () => {
  const { navigation, location } = router.state;
  const target = navigation.location ?? location;
  // ログイン画面での 401 は、メールアドレスかパスワードの誤り
  if (target.pathname === LOGIN_PATH) return;
  await router.navigate(loginPathFor(target), { replace: true });
  clearSession(queryClient);
};

const queryClient = createQueryClient({
  onUnauthenticated: () => void onUnauthenticated(),
});
const router = createAppRouter(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("#root がありません");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
