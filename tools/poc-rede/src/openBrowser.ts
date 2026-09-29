import { join } from "node:path";
import { errMsg, log } from "./log";
import { SYSTEM32, WINDOWS_DIR } from "./sysinfo";

/** Opens the default browser. If every attempt fails the URL is already in the console log. */
export function openBrowser(url: string): void {
  const attempts: string[][] =
    process.platform === "win32"
      ? [
          [join(SYSTEM32, "cmd.exe"), "/c", "start", "", url],
          [join(WINDOWS_DIR, "explorer.exe"), url],
        ]
      : process.platform === "darwin"
        ? [["open", url]]
        : [["xdg-open", url]];
  for (const cmd of attempts) {
    try {
      Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore", stdin: "ignore", windowsHide: true });
      return;
    } catch (e) {
      log(`Não consegui abrir o navegador com ${cmd[0]} (${errMsg(e)})`);
    }
  }
  log(`Abra manualmente no navegador: ${url}`);
}
