import { describe, expect, test } from "bun:test";
import { PRESET_TESTE } from "@simulador/catalogo";
import { criarPartida, passoMutavel } from "@simulador/motor";
import { acumularTick, novoAcumulador } from "../src/sala/historico";
import { Relogio } from "../src/sala/relogio";
import { AgendadorFalso } from "./ajuda";

describe("relógio", () => {
  test("dispara um tick a cada intervalo, a partir de um intervalo depois de iniciar", () => {
    const ag = new AgendadorFalso();
    const instantes: number[] = [];
    const r = new Relogio(ag, () => instantes.push(ag.agora()));
    r.iniciar(1000);
    ag.avancar(999);
    expect(instantes).toEqual([]);
    ag.avancar(3001);
    expect(instantes).toEqual([1000, 2000, 3000, 4000]);
  });

  test("alvo absoluto: o atraso de um tick não se acumula nos seguintes", () => {
    const ag = new AgendadorFalso();
    const instantes: number[] = [];
    let primeiro = true;
    const r = new Relogio(ag, () => {
      instantes.push(ag.agora());
      if (primeiro) {
        primeiro = false;
        ag.travarPor(400); // o tick demorou 400 ms para ser processado
      }
    });
    r.iniciar(1000);
    ag.avancar(3000);
    expect(instantes).toEqual([1000, 2000, 3000]);
  });

  test("atraso maior que um intervalo: não recupera ticks perdidos, reancora", () => {
    const ag = new AgendadorFalso();
    const instantes: number[] = [];
    const r = new Relogio(ag, () => instantes.push(ag.agora()));
    r.iniciar(1000);
    ag.travarPor(5500); // o processo travou 5,5 s: o tick das 1000 sai atrasado, sem rajada
    expect(instantes).toEqual([5500]);
    ag.avancar(2000);
    expect(instantes).toEqual([5500, 6500, 7500]);
  });

  test("parar cancela; o tick pode parar o relógio (pausa automática)", () => {
    const ag = new AgendadorFalso();
    let n = 0;
    const r = new Relogio(ag, () => {
      n++;
      if (n === 2) r.parar();
    });
    r.iniciar(500);
    ag.avancar(5000);
    expect(n).toBe(2);
    expect(r.rodando).toBe(false);
    expect(ag.pendentes).toBe(0);
    expect(r.proximoTickEmMs()).toBeNull();
  });

  test("próximo tick em ms e mudança de velocidade", () => {
    const ag = new AgendadorFalso();
    let n = 0;
    const r = new Relogio(ag, () => n++);
    r.iniciar(1000);
    ag.avancar(300);
    expect(r.proximoTickEmMs()).toBe(700);
    r.alterarIntervalo(200);
    expect(r.proximoTickEmMs()).toBe(200);
    ag.avancar(1000);
    expect(n).toBe(5);
    expect(() => r.iniciar(0)).toThrow(RangeError);
  });
});

describe("histórico semanal", () => {
  test("acumula a semana e fecha nas fronteiras 7, 14, 21 e 30", () => {
    let e = criarPartida({ preset: PRESET_TESTE, semente: "h", empresas: [{ nome: "A" }] });
    const acc = novoAcumulador();
    const fechamentos: number[] = [];
    let vendasSemana1 = 0;
    let registros7: ReturnType<typeof acumularTick> = null;
    for (let t = 1; t <= 30; t++) {
      const r = passoMutavel(e, t === 1 ? { decisoes: [{ tipo: "produto", empresa: "emp_01", produto: "leite_engarrafado", preco: 600, compraMensal: 30_000 }] } : {});
      e = r.estado;
      if (t <= 7) vendasSemana1 += r.historico.ofertas.find((h) => h.produto === "leite_engarrafado")!.vendas;
      const semana = acumularTick(acc, r.historico, 30);
      if (semana) fechamentos.push(t);
      if (t === 7) registros7 = semana;
    }
    expect(fechamentos).toEqual([7, 14, 21, 30]);
    const leite = registros7!.find((x) => x.produto === "leite_engarrafado")!;
    expect(leite.semana).toBe(1);
    expect(leite.vendas).toBeCloseTo(vendasSemana1, 9);
    expect(leite.preco).toBe(600);
    expect(Object.keys(acc.parciais)).toEqual([]);
  });

  test("o acumulador é JSON puro (sobrevive a reinício)", () => {
    const acc = novoAcumulador();
    let e = criarPartida({ preset: PRESET_TESTE, semente: "h", empresas: [{ nome: "A" }] });
    for (let t = 1; t <= 3; t++) {
      const r = passoMutavel(e);
      e = r.estado;
      acumularTick(acc, r.historico, 30);
    }
    expect(JSON.parse(JSON.stringify(acc))).toEqual(acc);
  });
});
