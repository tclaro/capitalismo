import { TelaAluno } from "./aluno/TelaAluno";
import { PainelProfessor } from "./professor/Painel";
import { TelaInicioProfessor } from "./professor/TelaInicio";
import { useRota } from "./roteador";
import { TelaAdmin } from "./telas/Admin";
import { TelaConectada, TelaEntrada, TelaNaoEncontrada } from "./telas/esqueletos";
import { TelaTeste } from "./telas/Teste";

export function App() {
  const rota = useRota();
  switch (rota.tela) {
    case "entrada":
      return <TelaEntrada codigoInicial={rota.codigo} />;
    case "aluno":
      return <TelaAluno key={rota.codigo} codigo={rota.codigo} />;
    case "professor":
      return rota.codigo ? <PainelProfessor key={rota.codigo} codigo={rota.codigo} /> : <TelaInicioProfessor />;
    case "telao":
      return <TelaConectada key={rota.codigo} codigo={rota.codigo} papel="telao" token={rota.token} titulo="Telão" />;
    case "admin":
      return <TelaAdmin />;
    case "teste":
      return <TelaTeste />;
    case "nao-encontrada":
      return <TelaNaoEncontrada />;
  }
}
