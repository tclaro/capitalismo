/**
 * Console do Windows: desliga o QuickEdit. Com ele ligado, um clique na janela do console entra em
 * modo de seleção e **congela o processo** na próxima escrita no console: o relógio das salas para
 * até alguém apertar Enter. Nada disso acontece se o console não for interativo (serviço, testes).
 */
import { dlopen, FFIType, ptr } from "bun:ffi";

const ENTRADA_PADRAO = -10;
const ENABLE_QUICK_EDIT_MODE = 0x0040;
const ENABLE_EXTENDED_FLAGS = 0x0080;

/** Devolve `true` se desligou, `false` se não se aplica ou não foi possível (nunca lança). */
export function desligarQuickEdit(): boolean {
  if (process.platform !== "win32" || !process.stdin.isTTY) return false;
  try {
    const k32 = dlopen("kernel32.dll", {
      GetStdHandle: { args: [FFIType.i32], returns: FFIType.ptr },
      GetConsoleMode: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
      SetConsoleMode: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
    });
    try {
      const alca = k32.symbols.GetStdHandle(ENTRADA_PADRAO);
      if (!alca) return false;
      const modo = new Uint32Array(1);
      if (!k32.symbols.GetConsoleMode(alca, ptr(modo))) return false;
      const novo = (modo[0]! | ENABLE_EXTENDED_FLAGS) & ~ENABLE_QUICK_EDIT_MODE;
      return k32.symbols.SetConsoleMode(alca, novo) !== 0;
    } finally {
      k32.close();
    }
  } catch {
    return false;
  }
}
