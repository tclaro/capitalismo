import "./tema/fonte.css";
import "./tema/tokens.css";
import "./tema/base.css";
import "./tema/jogo.css";
import "./tema/cadeia.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { aplicarTema, temaSalvo } from "./tema/tema";

aplicarTema(temaSalvo());

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
