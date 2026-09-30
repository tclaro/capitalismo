import { useRota } from "./roteador";
import { TelaConectada, TelaEmConstrucao, TelaEntrada, TelaNaoEncontrada } from "./telas/esqueletos";

export function App() {
  const rota = useRota();
  switch (rota.tela) {
    case "entrada":
      return <TelaEntrada codigoInicial={rota.codigo} />;
    case "aluno":
      return <TelaConectada key={rota.codigo} codigo={rota.codigo} papel="aluno" titulo="Sua empresa" />;
    case "professor":
      return rota.codigo ? <TelaConectada key={rota.codigo} codigo={rota.codigo} papel="professor" titulo="Painel do professor" /> : <TelaEmConstrucao titulo="Criar ou abrir uma sala" />;
    case "telao":
      return <TelaConectada key={rota.codigo} codigo={rota.codigo} papel="telao" token={rota.token} titulo="Telão" />;
    case "admin":
      return <TelaEmConstrucao titulo="Administração do servidor" />;
    case "nao-encontrada":
      return <TelaNaoEncontrada />;
  }
}
