import { describe, expect, test } from "bun:test";
import { PedidosDeEnvio } from "../src/envios";

describe("pedidos de envio às telas", () => {
  test("o primeiro pedido da sala manda agendar; os seguintes, não", () => {
    const p = new PedidosDeEnvio();
    expect([p.pedir("s1", "emp_01"), p.pedir("s1", "emp_02"), p.pedir("s1"), p.pedir("s2")]).toEqual([true, false, false, true]);
  });

  test("parciais da mesma sala se somam", () => {
    const p = new PedidosDeEnvio();
    p.pedir("s", "emp_01");
    p.pedir("s", "emp_02");
    p.pedir("s", "emp_01");
    expect([...p.retirar("s")!].sort()).toEqual(["emp_01", "emp_02"]);
  });

  test("um pedido para todos vence os parciais, antes ou depois deles", () => {
    const a = new PedidosDeEnvio();
    a.pedir("s", "emp_01");
    a.pedir("s");
    a.pedir("s", "emp_02"); // parcial depois do total não reduz o alcance
    expect(a.retirar("s")).toBeUndefined();
    const b = new PedidosDeEnvio();
    b.pedir("s");
    b.pedir("s", "emp_01");
    expect(b.retirar("s")).toBeUndefined();
  });

  test("retirar esquece o pedido: o próximo volta a mandar agendar, e as salas não se misturam", () => {
    const p = new PedidosDeEnvio();
    p.pedir("s1", "emp_01");
    p.pedir("s2");
    expect([...p.retirar("s1")!]).toEqual(["emp_01"]);
    expect(p.retirar("s2")).toBeUndefined();
    expect(p.pedir("s1", "emp_03")).toBe(true);
    expect([...p.retirar("s1")!]).toEqual(["emp_03"]);
    expect(p.retirar("s1")).toBeUndefined(); // nada pendente
  });
});
