/**
 * Endereços IPv4 deste computador, para mostrar aos alunos (adaptado da PoC, `sysinfo.ts`).
 */
import os from "node:os";

export interface Interface {
  nome: string;
  endereco: string;
  interna: boolean;
}

const NOME_VIRTUAL = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|loopback|bluetooth|tailscale|zerotier|vpn/i;

export function listarIPv4(): Interface[] {
  const lista: Interface[] = [];
  for (const [nome, enderecos] of Object.entries(os.networkInterfaces())) {
    for (const a of enderecos ?? []) {
      if (a.family === "IPv4") lista.push({ nome, endereco: a.address, interna: a.internal });
    }
  }
  return ordenarInterfaces(lista);
}

/** Endereços prováveis da rede do laboratório primeiro; adaptadores virtuais e 169.254 por último. */
export function ordenarInterfaces(lista: readonly Interface[]): Interface[] {
  const nota = (i: Interface) => {
    if (i.interna) return 9;
    let s = 0;
    if (NOME_VIRTUAL.test(i.nome)) s += 3;
    if (i.endereco.startsWith("169.254.")) s += 5;
    if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.endereco)) s += 1;
    return s;
  };
  return [...lista].sort((a, b) => nota(a) - nota(b));
}
