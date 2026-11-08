import { createBrowserRouter } from "react-router";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { SCREENS } from "./screens";

export const router = createBrowserRouter([
  ...SCREENS.map((screen) => ({
    path: screen.path,
    element: <PlaceholderPage screenId={screen.id} name={screen.name} />,
  })),
  { path: "*", element: <NotFoundPage /> },
]);
