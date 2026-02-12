import "./index.css";

import ReactDOM from "react-dom/client";
import AppRoutes from "@/routes";
import store from "@/redux";

import { BrowserRouter } from "react-router-dom";
import { Provider } from "react-redux";
import { Toaster } from "@/components/shadcn/ui/toaster"
import { Toaster as SoonerToaster } from "@/components/shadcn/ui/sonner"

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store} >
    <BrowserRouter>
      <AppRoutes />
      <Toaster />
      <SoonerToaster richColors theme={"light"} closeButton />
    </BrowserRouter>
  </Provider>
);
