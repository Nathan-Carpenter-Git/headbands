const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

export function generateLobbyCode(isTaken: (code: string) => boolean): string {
  let code: string;
  do {
    code = Array.from(
      { length: CODE_LENGTH },
      () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join("");
  } while (isTaken(code));
  return code;
}
