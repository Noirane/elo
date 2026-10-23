/**
 * Links que abrem o app por fora (ex.: a volta do login do Google, elo://auth?code=...).
 * A volta do login é tratada pelo próprio fluxo de entrada, então o roteador não deve navegar para "/auth".
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (/auth/.test(path) && /[?&#](code|error)=/.test(path)) return initial ? '/' : null;
  } catch {
    // em caso de dúvida, segue o link normalmente
  }
  return path;
}
